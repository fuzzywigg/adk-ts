import { beforeEach, describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fourteenth leftover residual deepen (complements #254 true/"true"/[] refs):
 * rewind `currentState[key] !== valueAtRewind` — string `"Infinity"` vs
 * `Object(1)` / `Object(false)` are strict `!==`; shared boxed ref omits.
 */
describe("runners state-delta string-infinity/object-one/object-false fourteenth residual deepen", () => {
	let runner: Runner;

	beforeEach(() => {
		runner = new Runner({
			appName: "runner-app14rd",
			agent: new LlmAgent({
				name: "root_agent",
				model: "gemini-2.0-flash-exp",
			}),
			sessionService: new InMemorySessionService(),
		});
	});

	it('includes key when rewind string "Infinity" vs current Object(1)', async () => {
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { flag: "Infinity" as any } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { other: 1 } }),
		});
		const session = {
			id: "s-str-inf-vs-obj1",
			appName: "runner-app14rd",
			userId: "u1",
			state: { flag: Object(1), other: 1 },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta.flag).toBe("Infinity");
		expect(delta.other).toBeNull();
	});

	it("includes key when rewind Object(false) and current is a different Object(false) ref", async () => {
		const rewindBoxed = Object(false);
		const currentBoxed = Object(false);
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({
				stateDelta: { flag: rewindBoxed as any },
			}),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { other: 1 } }),
		});
		const session = {
			id: "s-obj-false-ref",
			appName: "runner-app14rd",
			userId: "u1",
			state: { flag: currentBoxed, other: 1 },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta.flag).toBe(rewindBoxed);
		expect(delta.flag).not.toBe(currentBoxed);
		expect(delta.other).toBeNull();
	});

	it("omits key when rewind and current share the same Object(1) reference", async () => {
		const shared = Object(1);
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { flag: shared as any } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { other: 1 } }),
		});
		const session = {
			id: "s-obj1-same-ref",
			appName: "runner-app14rd",
			userId: "u1",
			state: { flag: shared, other: 1 },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta.flag).toBeUndefined();
		expect(delta.other).toBeNull();
	});
});
