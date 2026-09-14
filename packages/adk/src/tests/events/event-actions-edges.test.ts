import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";

describe("Event constructor edges", () => {
	beforeEach(() => {
		vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("invocationId ?? ''", () => {
		it("defaults invocationId to empty string when omitted", () => {
			const event = new Event({ author: "user" });
			expect(event.invocationId).toBe("");
		});

		it("preserves explicit empty-string invocationId", () => {
			const event = new Event({ author: "user", invocationId: "" });
			expect(event.invocationId).toBe("");
		});

		it("preserves non-empty invocationId", () => {
			const event = new Event({ author: "user", invocationId: "inv-42" });
			expect(event.invocationId).toBe("inv-42");
		});
	});

	describe("actions ?? new EventActions()", () => {
		it("creates default EventActions when actions omitted", () => {
			const event = new Event({ author: "agent" });
			expect(event.actions).toBeInstanceOf(EventActions);
			expect(event.actions.stateDelta).toEqual({});
			expect(event.actions.artifactDelta).toEqual({});
		});

		it("uses provided actions instance", () => {
			const actions = new EventActions({ skipSummarization: true });
			const event = new Event({ author: "agent", actions });
			expect(event.actions).toBe(actions);
			expect(event.actions.skipSummarization).toBe(true);
		});
	});

	describe("id ?? Event.newId()", () => {
		it("generates id when omitted", () => {
			const event = new Event({ author: "agent" });
			expect(event.id).toMatch(/^[a-f0-9]{8}$/);
		});

		it("preserves explicit id", () => {
			const event = new Event({ author: "agent", id: "fixedid1" });
			expect(event.id).toBe("fixedid1");
		});
	});

	describe("timestamp ?? now (explicit undefined vs 0)", () => {
		it("defaults timestamp to now when omitted", () => {
			const event = new Event({ author: "agent" });
			expect(event.timestamp).toBe(Math.floor(1_700_000_000_000 / 1000));
		});

		it("preserves explicit timestamp 0 (does not coalesce via ??)", () => {
			const event = new Event({ author: "agent", timestamp: 0 });
			expect(event.timestamp).toBe(0);
		});

		it("preserves explicit positive timestamp", () => {
			const event = new Event({ author: "agent", timestamp: 1_700_000_000 });
			expect(event.timestamp).toBe(1_700_000_000);
		});

		it("uses now when timestamp is explicitly undefined", () => {
			const event = new Event({ author: "agent", timestamp: undefined });
			expect(event.timestamp).toBe(Math.floor(1_700_000_000_000 / 1000));
		});
	});
});

describe("EventActions edges", () => {
	describe("stateDelta || {} and artifactDelta || {}", () => {
		it("defaults deltas to empty objects", () => {
			const actions = new EventActions();
			expect(actions.stateDelta).toEqual({});
			expect(actions.artifactDelta).toEqual({});
		});

		it("coalesces nullish deltas via || {}", () => {
			const actions = new EventActions({
				stateDelta: null as any,
				artifactDelta: null as any,
			});
			expect(actions.stateDelta).toEqual({});
			expect(actions.artifactDelta).toEqual({});
		});

		it("preserves explicit zero artifact versions", () => {
			const actions = new EventActions({ artifactDelta: { "out.txt": 0 } });
			expect(actions.artifactDelta).toEqual({ "out.txt": 0 });
		});
	});

	describe("optional string fields", () => {
		it("preserves empty-string transferToAgent", () => {
			const actions = new EventActions({ transferToAgent: "" });
			expect(actions.transferToAgent).toBe("");
		});

		it("preserves empty-string rewindBeforeInvocationId", () => {
			const actions = new EventActions({ rewindBeforeInvocationId: "" });
			expect(actions.rewindBeforeInvocationId).toBe("");
		});
	});
});
