import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";

describe("Event", () => {
	it("creates an id and defaults timestamp", () => {
		const event = new Event({ author: "agent" });

		expect(event.author).toBe("agent");
		expect(event.id).toMatch(/^[a-f0-9]{8}$/);
		expect(event.timestamp).toBeGreaterThan(0);
	});

	it("extracts function calls and responses", () => {
		const event = new Event({
			author: "agent",
			content: {
				parts: [
					{ functionCall: { name: "search", args: { q: "x" } } },
					{ functionResponse: { name: "search", response: { ok: true } } },
				],
			},
		});

		expect(event.getFunctionCalls()).toEqual([
			{ name: "search", args: { q: "x" } },
		]);
		expect(event.getFunctionResponses()).toEqual([
			{ name: "search", response: { ok: true } },
		]);
	});

	it("detects trailing code execution results", () => {
		const withResult = new Event({
			author: "agent",
			content: {
				parts: [{ text: "code" }, { codeExecutionResult: { output: "done" } }],
			},
		});
		const withoutResult = new Event({
			author: "agent",
			content: { parts: [{ text: "plain" }] },
		});

		expect(withResult.hasTrailingCodeExecutionResult()).toBe(true);
		expect(withoutResult.hasTrailingCodeExecutionResult()).toBe(false);
	});

	it("treats skipSummarization and long-running tools as final", () => {
		expect(
			new Event({
				author: "agent",
				actions: new EventActions({ skipSummarization: true }),
				content: {
					parts: [{ functionCall: { name: "wait", args: {} } }],
				},
			}).isFinalResponse(),
		).toBe(true);

		expect(
			new Event({
				author: "agent",
				longRunningToolIds: new Set(["1"]),
			}).isFinalResponse(),
		).toBe(true);
	});

	it("is final only when there are no tool calls/responses and not partial", () => {
		expect(
			new Event({
				author: "agent",
				content: { parts: [{ text: "done" }] },
			}).isFinalResponse(),
		).toBe(true);

		expect(
			new Event({
				author: "agent",
				partial: true,
				content: { parts: [{ text: "streaming" }] },
			}).isFinalResponse(),
		).toBe(false);

		expect(
			new Event({
				author: "agent",
				content: {
					parts: [{ functionCall: { name: "tool", args: {} } }],
				},
			}).isFinalResponse(),
		).toBe(false);
	});

	it("generates unique short ids", () => {
		const ids = new Set(Array.from({ length: 20 }, () => Event.newId()));
		expect(ids.size).toBe(20);
		for (const id of ids) {
			expect(id).toHaveLength(8);
		}
	});

	it("applies constructor option matrix for ids, branch, actions, and content", () => {
		const actions = new EventActions({ skipSummarization: true });
		const event = new Event({
			author: "orchestrator",
			invocationId: "inv-custom",
			branch: "root.child.leaf",
			id: "fixedid1",
			timestamp: 1_700_000_000,
			actions,
			content: { role: "model", parts: [{ text: "hi" }] },
			partial: false,
			longRunningToolIds: new Set(["tool-a"]),
		});

		expect(event.invocationId).toBe("inv-custom");
		expect(event.branch).toBe("root.child.leaf");
		expect(event.id).toBe("fixedid1");
		expect(event.timestamp).toBe(1_700_000_000);
		expect(event.actions).toBe(actions);
		expect(event.content?.parts?.[0]?.text).toBe("hi");
		expect(event.partial).toBe(false);
		expect(event.longRunningToolIds?.has("tool-a")).toBe(true);
	});

	it("defaults invocationId and actions when omitted", () => {
		const event = new Event({ author: "user" });
		expect(event.invocationId).toBe("");
		expect(event.actions).toBeInstanceOf(EventActions);
		expect(event.branch).toBeUndefined();
		expect(event.longRunningToolIds).toBeUndefined();
	});

	it("is not final when only function responses are present", () => {
		expect(
			new Event({
				author: "tool",
				content: {
					parts: [
						{ functionResponse: { name: "search", response: { ok: true } } },
					],
				},
			}).isFinalResponse(),
		).toBe(false);
	});

	it("is not final when trailing codeExecutionResult is present", () => {
		expect(
			new Event({
				author: "agent",
				content: {
					parts: [{ text: "ran" }, { codeExecutionResult: { output: "1" } }],
				},
			}).isFinalResponse(),
		).toBe(false);
	});

	it("treats empty longRunningToolIds Set as final (truthy Set)", () => {
		expect(
			new Event({
				author: "agent",
				longRunningToolIds: new Set(),
				content: {
					parts: [{ functionCall: { name: "pending", args: {} } }],
				},
			}).isFinalResponse(),
		).toBe(true);
	});

	it("short-circuits skipSummarization ahead of function calls and partial", () => {
		expect(
			new Event({
				author: "agent",
				partial: true,
				actions: new EventActions({ skipSummarization: true }),
				content: {
					parts: [{ functionCall: { name: "x", args: {} } }],
				},
			}).isFinalResponse(),
		).toBe(true);
	});

	it("returns empty function call/response lists for missing or non-array parts", () => {
		expect(new Event({ author: "a" }).getFunctionCalls()).toEqual([]);
		expect(new Event({ author: "a" }).getFunctionResponses()).toEqual([]);
		expect(
			new Event({
				author: "a",
				content: { parts: "not-an-array" as any },
			}).getFunctionCalls(),
		).toEqual([]);
		expect(
			new Event({
				author: "a",
				content: { parts: null as any },
			}).getFunctionResponses(),
		).toEqual([]);
	});

	it("collects multiple function calls and responses in order", () => {
		const event = new Event({
			author: "agent",
			content: {
				parts: [
					{ text: "intro" },
					{ functionCall: { name: "a", args: { n: 1 } } },
					{ functionCall: { name: "b", args: { n: 2 } } },
					{ functionResponse: { name: "a", response: 1 } },
					{ functionResponse: { name: "b", response: 2 } },
				],
			},
		});
		expect(event.getFunctionCalls()).toEqual([
			{ name: "a", args: { n: 1 } },
			{ name: "b", args: { n: 2 } },
		]);
		expect(event.getFunctionResponses()).toEqual([
			{ name: "a", response: 1 },
			{ name: "b", response: 2 },
		]);
	});

	it("hasTrailingCodeExecutionResult is false for empty/missing/null trailing result", () => {
		expect(new Event({ author: "a" }).hasTrailingCodeExecutionResult()).toBe(
			false,
		);
		expect(
			new Event({
				author: "a",
				content: { parts: [] },
			}).hasTrailingCodeExecutionResult(),
		).toBe(false);
		expect(
			new Event({
				author: "a",
				content: { parts: [{ codeExecutionResult: null }] },
			}).hasTrailingCodeExecutionResult(),
		).toBe(false);
		expect(
			new Event({
				author: "a",
				content: { parts: [{ codeExecutionResult: undefined }] },
			}).hasTrailingCodeExecutionResult(),
		).toBe(false);
		expect(
			new Event({
				author: "a",
				content: {
					parts: [
						{ codeExecutionResult: { output: "early" } },
						{ text: "after" },
					],
				},
			}).hasTrailingCodeExecutionResult(),
		).toBe(false);
	});

	it("is final for plain text with undefined longRunningToolIds", () => {
		const event = new Event({
			author: "agent",
			content: { parts: [{ text: "done" }] },
		});
		expect(event.longRunningToolIds).toBeUndefined();
		expect(event.isFinalResponse()).toBe(true);
	});

	it("is not final when both function calls and code result trail", () => {
		expect(
			new Event({
				author: "agent",
				content: {
					parts: [
						{ functionCall: { name: "run", args: {} } },
						{ codeExecutionResult: { output: "x" } },
					],
				},
			}).isFinalResponse(),
		).toBe(false);
	});

	it("preserves partial true when passed through constructor", () => {
		const event = new Event({
			author: "agent",
			partial: true,
			content: { parts: [{ text: "stream" }] },
		});
		expect(event.partial).toBe(true);
		expect(event.isFinalResponse()).toBe(false);
	});

	it("ignores non-function parts when collecting calls and responses", () => {
		const event = new Event({
			author: "agent",
			content: {
				parts: [
					{ text: "ignore" },
					{ inlineData: { data: "x", mimeType: "text/plain" } },
					{ functionCall: { name: "only", args: {} } },
					{ codeExecutionResult: { output: "y" } },
					{ functionResponse: { name: "only", response: true } },
				],
			},
		});
		expect(event.getFunctionCalls()).toEqual([{ name: "only", args: {} }]);
		expect(event.getFunctionResponses()).toEqual([
			{ name: "only", response: true },
		]);
	});
});

describe("Event leftover edges", () => {
	it("isFinalResponse is true for events with empty content", () => {
		expect(new Event({ author: "agent", content: {} }).isFinalResponse()).toBe(
			true,
		);
	});

	it("hasTrailingCodeExecutionResult is false when content.parts is undefined", () => {
		expect(
			new Event({
				author: "agent",
				content: { role: "model" },
			}).hasTrailingCodeExecutionResult(),
		).toBe(false);
	});

	it("Event.newId uses only lowercase hex characters", () => {
		const id = Event.newId();
		expect(id).toMatch(/^[a-f0-9]{8}$/);
	});

	it("preserves explicit partial false in constructor", () => {
		const event = new Event({
			author: "agent",
			partial: false,
			content: { parts: [{ text: "done" }] },
		});
		expect(event.partial).toBe(false);
		expect(event.isFinalResponse()).toBe(true);
	});

	it("getFunctionCalls includes calls with undefined args", () => {
		const event = new Event({
			author: "agent",
			content: {
				parts: [{ functionCall: { name: "tool" } }],
			},
		});
		expect(event.getFunctionCalls()).toEqual([{ name: "tool" }]);
	});

	it("is not final when content has only empty parts array and partial is true", () => {
		expect(
			new Event({
				author: "agent",
				partial: true,
				content: { parts: [] },
			}).isFinalResponse(),
		).toBe(false);
	});

	it("preserves empty-string branch when provided", () => {
		const event = new Event({ author: "agent", branch: "" });
		expect(event.branch).toBe("");
	});

	it("longRunningToolIds with entries makes function-call events final", () => {
		const event = new Event({
			author: "agent",
			longRunningToolIds: new Set(["lr-1"]),
			content: {
				parts: [{ functionCall: { name: "slow", args: {}, id: "lr-1" } }],
			},
		});
		expect(event.isFinalResponse()).toBe(true);
	});
});
