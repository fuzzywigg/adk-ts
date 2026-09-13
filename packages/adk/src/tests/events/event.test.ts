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

	it("returns empty function lists when content is missing or empty", () => {
		expect(new Event({ author: "agent" }).getFunctionCalls()).toEqual([]);
		expect(new Event({ author: "agent" }).getFunctionResponses()).toEqual([]);
		expect(
			new Event({
				author: "agent",
				content: { parts: [] },
			}).getFunctionCalls(),
		).toEqual([]);
		expect(
			new Event({
				author: "agent",
				content: { parts: [{ text: "plain" }] },
			}).getFunctionCalls(),
		).toEqual([]);
	});

	it("is not final when a trailing code execution result is present", () => {
		expect(
			new Event({
				author: "agent",
				content: {
					parts: [{ text: "ran" }, { codeExecutionResult: { output: "ok" } }],
				},
			}).isFinalResponse(),
		).toBe(false);
	});

	it("hasTrailingCodeExecutionResult is false for empty or missing parts", () => {
		expect(
			new Event({ author: "agent" }).hasTrailingCodeExecutionResult(),
		).toBe(false);
		expect(
			new Event({
				author: "agent",
				content: { parts: [] },
			}).hasTrailingCodeExecutionResult(),
		).toBe(false);
	});

	it("preserves explicit id, timestamp, branch, and invocationId", () => {
		const event = new Event({
			author: "agent",
			id: "fixedid1",
			timestamp: 123,
			branch: "root.child",
			invocationId: "inv-9",
		});

		expect(event.id).toBe("fixedid1");
		expect(event.timestamp).toBe(123);
		expect(event.branch).toBe("root.child");
		expect(event.invocationId).toBe("inv-9");
	});
});
