import { describe, expect, it } from "vitest";
import { EventActions } from "../../events/event-actions";

describe("EventActions", () => {
	it("defaults deltas to empty objects", () => {
		const actions = new EventActions();
		expect(actions.stateDelta).toEqual({});
		expect(actions.artifactDelta).toEqual({});
		expect(actions.skipSummarization).toBeUndefined();
		expect(actions.transferToAgent).toBeUndefined();
	});

	it("accepts constructor options", () => {
		const actions = new EventActions({
			skipSummarization: true,
			transferToAgent: "helper",
			escalate: true,
			stateDelta: { foo: 1 },
			artifactDelta: { "a.txt": 2 },
			rewindBeforeInvocationId: "inv-1",
			compaction: {
				startTimestamp: 1,
				endTimestamp: 2,
				compactedContent: { role: "model", parts: [{ text: "summary" }] },
			},
		});

		expect(actions.skipSummarization).toBe(true);
		expect(actions.transferToAgent).toBe("helper");
		expect(actions.escalate).toBe(true);
		expect(actions.stateDelta).toEqual({ foo: 1 });
		expect(actions.artifactDelta).toEqual({ "a.txt": 2 });
		expect(actions.rewindBeforeInvocationId).toBe("inv-1");
		expect(actions.compaction?.compactedContent.parts?.[0]).toEqual({
			text: "summary",
		});
	});
});
