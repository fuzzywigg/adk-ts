import { beforeEach, describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fourteenth leftover (HEAVY tip-relaunch residual after #243):
 * rewind `currentState[key] !== valueAtRewind` residual beyond SameValueZero —
 * boolean `true` vs `"true"` and distinct `[]` refs are `!==` so keys re-emit.
 */
describe("runners state-delta true/string-true/array-ref-neq fourteenth leftover", () => {
	let runner: Runner;

	beforeEach(() => {
		runner = new Runner({
			appName: "runner-app14h",
			agent: new LlmAgent({
				name: "root_agent",
				model: "gemini-2.0-flash-exp",
			}),
			sessionService: new InMemorySessionService(),
		});
	});

	it("includes key when rewind true vs current string-true (strict !==)", async () => {
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { flag: true } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { other: 1 } }),
		});
		const session = {
			id: "s-true-vs-string",
			appName: "runner-app14h",
			userId: "u1",
			state: { flag: "true", other: 1 },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta.flag).toBe(true);
		expect(delta.other).toBeNull();
	});

	it("includes key when rewind [] and current is a different [] ref", async () => {
		const rewindArr: unknown[] = [];
		const currentArr: unknown[] = [];
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { items: rewindArr } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { other: 1 } }),
		});
		const session = {
			id: "s-array-ref",
			appName: "runner-app14h",
			userId: "u1",
			state: { items: currentArr, other: 1 },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta.items).toBe(rewindArr);
		expect(delta.items).not.toBe(currentArr);
		expect(delta.other).toBeNull();
	});

	it("omits key when rewind and current share the same [] reference", async () => {
		const shared: unknown[] = [];
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { items: shared } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { other: 1 } }),
		});
		const session = {
			id: "s-array-same-ref",
			appName: "runner-app14h",
			userId: "u1",
			state: { items: shared, other: 1 },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta.items).toBeUndefined();
		expect(delta.other).toBeNull();
	});
});
