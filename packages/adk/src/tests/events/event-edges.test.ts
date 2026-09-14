import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";

describe("Event leftover edges (post #113)", () => {
	it("skipSummarization: false does not short-circuit function-call events", () => {
		const event = new Event({
			author: "agent",
			actions: new EventActions({ skipSummarization: false }),
			content: {
				parts: [{ functionCall: { name: "tool", args: {} } }],
			},
		});
		expect(event.actions.skipSummarization).toBe(false);
		expect(event.isFinalResponse()).toBe(false);
	});

	it("longRunningToolIds wins even when skipSummarization is explicitly false", () => {
		const event = new Event({
			author: "agent",
			actions: new EventActions({ skipSummarization: false }),
			longRunningToolIds: new Set(["lr-1"]),
			content: {
				parts: [{ functionCall: { name: "tool", args: {} } }],
			},
		});
		expect(event.isFinalResponse()).toBe(true);
	});

	it("isFinalResponse is false when functionCall and functionResponse share one event", () => {
		const event = new Event({
			author: "agent",
			content: {
				parts: [
					{ functionCall: { name: "a", args: {} } },
					{ functionResponse: { name: "a", response: { ok: true } } },
				],
			},
		});
		expect(event.getFunctionCalls()).toHaveLength(1);
		expect(event.getFunctionResponses()).toHaveLength(1);
		expect(event.isFinalResponse()).toBe(false);
	});

	it("hasTrailingCodeExecutionResult ignores non-trailing codeExecutionResult parts", () => {
		const event = new Event({
			author: "agent",
			content: {
				parts: [{ codeExecutionResult: { outcome: "OK" } }, { text: "after" }],
			},
		});
		expect(event.hasTrailingCodeExecutionResult()).toBe(false);
		expect(event.isFinalResponse()).toBe(true);
	});

	it("EventActions escalate true coexists with empty delta maps", () => {
		const actions = new EventActions({ escalate: true });
		expect(actions.escalate).toBe(true);
		expect(actions.stateDelta).toEqual({});
		expect(actions.artifactDelta).toEqual({});
		expect(actions.skipSummarization).toBeUndefined();
	});

	it("EventActions rewindBeforeInvocationId can pair with compaction metadata", () => {
		const actions = new EventActions({
			rewindBeforeInvocationId: "inv-rewind",
			compaction: {
				startTimestamp: 1,
				endTimestamp: 2,
				compactedContent: { role: "model", parts: [{ text: "sum" }] },
			},
		});
		expect(actions.rewindBeforeInvocationId).toBe("inv-rewind");
		expect(actions.compaction?.compactedContent.parts?.[0]).toEqual({
			text: "sum",
		});
	});
});
