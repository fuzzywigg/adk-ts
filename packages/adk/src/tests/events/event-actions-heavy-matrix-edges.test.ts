import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";

describe("EventActions heavy matrix leftover edges", () => {
	it("defaults delta maps to empty objects", () => {
		const actions = new EventActions();
		expect(actions.stateDelta).toEqual({});
		expect(actions.artifactDelta).toEqual({});
		expect(actions.skipSummarization).toBeUndefined();
		expect(actions.escalate).toBeUndefined();
		expect(actions.transferToAgent).toBeUndefined();
	});

	it("preserves explicit false skipSummarization and escalate", () => {
		const actions = new EventActions({
			skipSummarization: false,
			escalate: false,
		});
		expect(actions.skipSummarization).toBe(false);
		expect(actions.escalate).toBe(false);
	});

	it("accepts transferToAgent empty string", () => {
		const actions = new EventActions({ transferToAgent: "" });
		expect(actions.transferToAgent).toBe("");
	});

	it("stores stateDelta and artifactDelta by reference", () => {
		const stateDelta = { a: 1 };
		const artifactDelta = { "f.txt": 0 };
		const actions = new EventActions({ stateDelta, artifactDelta });
		stateDelta.a = 2;
		artifactDelta["f.txt"] = 1;
		expect(actions.stateDelta.a).toBe(2);
		expect(actions.artifactDelta["f.txt"]).toBe(1);
	});

	it("supports requestedAuthConfigs and compaction together", () => {
		const actions = new EventActions({
			requestedAuthConfigs: { tool: { scheme: "oauth2" } },
			compaction: {
				startTimestamp: 1,
				endTimestamp: 2,
				compactedContent: { role: "model", parts: [{ text: "sum" }] },
			},
			rewindBeforeInvocationId: "inv-1",
		});
		expect(actions.requestedAuthConfigs?.tool).toEqual({ scheme: "oauth2" });
		expect(actions.compaction?.startTimestamp).toBe(1);
		expect(actions.rewindBeforeInvocationId).toBe("inv-1");
	});

	it("escalate true coexists with transferToAgent", () => {
		const actions = new EventActions({
			escalate: true,
			transferToAgent: "boss",
		});
		expect(actions.escalate).toBe(true);
		expect(actions.transferToAgent).toBe("boss");
	});
});

describe("Event heavy matrix leftover edges", () => {
	it("assigns defaults for id, timestamp, and empty invocationId", () => {
		const event = new Event({ author: "agent" });
		expect(event.author).toBe("agent");
		expect(event.invocationId).toBe("");
		expect(event.id.length).toBeGreaterThan(0);
		expect(event.timestamp).toBeGreaterThan(0);
		expect(event.actions).toBeInstanceOf(EventActions);
	});

	it("respects explicit id, timestamp, branch, and invocationId", () => {
		const event = new Event({
			author: "user",
			id: "fixed-id",
			timestamp: 42,
			branch: "root.child",
			invocationId: "inv-9",
		});
		expect(event.id).toBe("fixed-id");
		expect(event.timestamp).toBe(42);
		expect(event.branch).toBe("root.child");
		expect(event.invocationId).toBe("inv-9");
	});

	it("isFinalResponse true for plain text without tools", () => {
		const event = new Event({
			author: "agent",
			content: { parts: [{ text: "hello" }] },
		});
		expect(event.isFinalResponse()).toBe(true);
		expect(event.getFunctionCalls()).toEqual([]);
		expect(event.getFunctionResponses()).toEqual([]);
	});

	it("isFinalResponse false for functionCall-only events", () => {
		const event = new Event({
			author: "agent",
			content: {
				parts: [{ functionCall: { name: "tool", args: {} } }],
			},
		});
		expect(event.isFinalResponse()).toBe(false);
		expect(event.getFunctionCalls()).toHaveLength(1);
	});

	it("isFinalResponse false for functionResponse-only events", () => {
		const event = new Event({
			author: "agent",
			content: {
				parts: [{ functionResponse: { name: "tool", response: { ok: true } } }],
			},
		});
		expect(event.isFinalResponse()).toBe(false);
		expect(event.getFunctionResponses()).toHaveLength(1);
	});

	it("skipSummarization true forces final even with function calls", () => {
		const event = new Event({
			author: "agent",
			actions: new EventActions({ skipSummarization: true }),
			content: {
				parts: [{ functionCall: { name: "tool", args: {} } }],
			},
		});
		expect(event.isFinalResponse()).toBe(true);
	});

	it("skipSummarization false does not force final for tool calls", () => {
		const event = new Event({
			author: "agent",
			actions: new EventActions({ skipSummarization: false }),
			content: {
				parts: [{ functionCall: { name: "tool", args: {} } }],
			},
		});
		expect(event.isFinalResponse()).toBe(false);
	});

	it("longRunningToolIds forces final even when skipSummarization is false", () => {
		const event = new Event({
			author: "agent",
			actions: new EventActions({ skipSummarization: false }),
			longRunningToolIds: new Set(["lr"]),
			content: {
				parts: [{ functionCall: { name: "tool", args: {} } }],
			},
		});
		expect(event.isFinalResponse()).toBe(true);
	});

	it("empty longRunningToolIds set is still truthy and forces final", () => {
		const event = new Event({
			author: "agent",
			longRunningToolIds: new Set(),
			content: {
				parts: [{ functionCall: { name: "tool", args: {} } }],
			},
		});
		expect(event.isFinalResponse()).toBe(true);
	});

	it("partial true prevents final for text responses", () => {
		const event = new Event({
			author: "agent",
			partial: true,
			content: { parts: [{ text: "stream..." }] },
		});
		expect(event.isFinalResponse()).toBe(false);
	});

	it("trailing codeExecutionResult prevents final", () => {
		const event = new Event({
			author: "agent",
			content: {
				parts: [
					{ text: "code ran" },
					{ codeExecutionResult: { outcome: "OK", output: "1" } },
				],
			},
		});
		expect(event.hasTrailingCodeExecutionResult()).toBe(true);
		expect(event.isFinalResponse()).toBe(false);
	});

	it("non-trailing codeExecutionResult does not count as trailing", () => {
		const event = new Event({
			author: "agent",
			content: {
				parts: [{ codeExecutionResult: { outcome: "OK" } }, { text: "after" }],
			},
		});
		expect(event.hasTrailingCodeExecutionResult()).toBe(false);
		expect(event.isFinalResponse()).toBe(true);
	});

	it("getFunctionCalls collects multiple calls in order", () => {
		const event = new Event({
			author: "agent",
			content: {
				parts: [
					{ functionCall: { name: "a", args: { x: 1 } } },
					{ text: "mid" },
					{ functionCall: { name: "b", args: {} } },
				],
			},
		});
		expect(event.getFunctionCalls().map((c) => c.name)).toEqual(["a", "b"]);
	});

	it("getFunctionResponses collects multiple responses in order", () => {
		const event = new Event({
			author: "agent",
			content: {
				parts: [
					{ functionResponse: { name: "a", response: { ok: 1 } } },
					{ functionResponse: { name: "b", response: { ok: 2 } } },
				],
			},
		});
		expect(event.getFunctionResponses().map((r) => r.name)).toEqual(["a", "b"]);
	});

	it("missing content parts yield empty function collections", () => {
		const event = new Event({ author: "agent", content: undefined });
		expect(event.getFunctionCalls()).toEqual([]);
		expect(event.getFunctionResponses()).toEqual([]);
		expect(event.hasTrailingCodeExecutionResult()).toBe(false);
		expect(event.isFinalResponse()).toBe(true);
	});

	it("functionCall and functionResponse in one event is not final", () => {
		const event = new Event({
			author: "agent",
			content: {
				parts: [
					{ functionCall: { name: "a", args: {} } },
					{ functionResponse: { name: "a", response: { ok: true } } },
				],
			},
		});
		expect(event.isFinalResponse()).toBe(false);
	});

	it("newId generates unique ids across calls", () => {
		const a = Event.newId();
		const b = Event.newId();
		expect(a).not.toBe(b);
		expect(a.length).toBeGreaterThan(0);
	});

	it("empty parts array is treated as no tools and final", () => {
		const event = new Event({
			author: "agent",
			content: { parts: [] },
		});
		expect(event.isFinalResponse()).toBe(true);
		expect(event.hasTrailingCodeExecutionResult()).toBe(false);
	});
});
