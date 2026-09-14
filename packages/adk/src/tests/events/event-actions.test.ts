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
		expect(actions.compaction?.startTimestamp).toBe(1);
		expect(actions.compaction?.endTimestamp).toBe(2);
		expect(actions.compaction?.compactedContent.parts?.[0]).toEqual({
			text: "summary",
		});
	});

	it("round-trips requestedAuthConfigs and leaves unset optionals undefined", () => {
		const withAuth = new EventActions({
			requestedAuthConfigs: {
				tool_a: { type: "oauth2", scopes: ["read"] },
			},
		});
		expect(withAuth.requestedAuthConfigs).toEqual({
			tool_a: { type: "oauth2", scopes: ["read"] },
		});
		expect(withAuth.skipSummarization).toBeUndefined();
		expect(withAuth.transferToAgent).toBeUndefined();
		expect(withAuth.escalate).toBeUndefined();
		expect(withAuth.compaction).toBeUndefined();
		expect(withAuth.rewindBeforeInvocationId).toBeUndefined();
		expect(withAuth.stateDelta).toEqual({});
		expect(withAuth.artifactDelta).toEqual({});

		const empty = new EventActions({});
		expect(empty.requestedAuthConfigs).toBeUndefined();
		expect(empty.stateDelta).toEqual({});
		expect(empty.artifactDelta).toEqual({});
	});

	it("coalesces explicitly undefined deltas to empty objects", () => {
		const actions = new EventActions({
			stateDelta: undefined,
			artifactDelta: undefined,
			escalate: false,
			skipSummarization: false,
		});
		expect(actions.stateDelta).toEqual({});
		expect(actions.artifactDelta).toEqual({});
		expect(actions.escalate).toBe(false);
		expect(actions.skipSummarization).toBe(false);
	});

	it("coalesces nullish deltas via || {} while preserving false escalate/skipSummarization", () => {
		const withNull = new EventActions({
			stateDelta: null as any,
			artifactDelta: null as any,
		});
		expect(withNull.stateDelta).toEqual({});
		expect(withNull.artifactDelta).toEqual({});
		expect(withNull.escalate).toBeUndefined();
		expect(withNull.skipSummarization).toBeUndefined();

		const withFalse = new EventActions({
			escalate: false,
			skipSummarization: false,
			stateDelta: {},
			artifactDelta: {},
		});
		expect(withFalse.escalate).toBe(false);
		expect(withFalse.skipSummarization).toBe(false);
		expect(withFalse.escalate).not.toBeUndefined();
		expect(withFalse.skipSummarization).not.toBeUndefined();
		expect(withFalse.stateDelta).toEqual({});
		expect(withFalse.artifactDelta).toEqual({});

		const mixed = new EventActions({
			stateDelta: undefined,
			artifactDelta: { keep: 1 },
			escalate: false,
			skipSummarization: false,
			transferToAgent: undefined,
		});
		expect(mixed.stateDelta).toEqual({});
		expect(mixed.artifactDelta).toEqual({ keep: 1 });
		expect(mixed.escalate).toBe(false);
		expect(mixed.skipSummarization).toBe(false);
		expect(mixed.transferToAgent).toBeUndefined();
	});
});

describe("EventActions leftover edges", () => {
	it("stores compaction-only options without other action fields", () => {
		const actions = new EventActions({
			compaction: {
				startTimestamp: 10,
				endTimestamp: 20,
				compactedContent: { role: "model", parts: [{ text: "summary" }] },
			},
		});
		expect(actions.compaction?.startTimestamp).toBe(10);
		expect(actions.skipSummarization).toBeUndefined();
		expect(actions.stateDelta).toEqual({});
	});

	it("preserves empty requestedAuthConfigs object", () => {
		const actions = new EventActions({ requestedAuthConfigs: {} });
		expect(actions.requestedAuthConfigs).toEqual({});
	});

	it("preserves empty-string transferToAgent", () => {
		const actions = new EventActions({ transferToAgent: "" });
		expect(actions.transferToAgent).toBe("");
	});

	it("preserves empty-string rewindBeforeInvocationId", () => {
		const actions = new EventActions({ rewindBeforeInvocationId: "" });
		expect(actions.rewindBeforeInvocationId).toBe("");
	});

	it("stores zero-valued artifact versions in artifactDelta", () => {
		const actions = new EventActions({ artifactDelta: { "out.txt": 0 } });
		expect(actions.artifactDelta).toEqual({ "out.txt": 0 });
	});
});
