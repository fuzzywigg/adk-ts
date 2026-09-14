import { beforeEach, describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fourteenth leftover: rewind `currentState[key] !== valueAtRewind` —
 * `-0`↔`0` SameValueZero omit; `NaN !== NaN` include.
 */
describe("runners state-delta negzero/nan SameValueZero fourteenth leftover", () => {
	let runner: Runner;

	beforeEach(() => {
		runner = new Runner({
			appName: "runner-app14",
			agent: new LlmAgent({
				name: "root_agent",
				model: "gemini-2.0-flash-exp",
			}),
			sessionService: new InMemorySessionService(),
		});
	});

	it("omits key when rewind holds -0 and current holds 0 (SameValueZero)", async () => {
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { n: -0 } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { other: 1 } }),
		});
		const session = {
			id: "s-negzero",
			appName: "runner-app14",
			userId: "u1",
			state: { n: 0, other: 1 },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta.n).toBeUndefined();
		expect(delta.other).toBeNull();
	});

	it("includes key when rewind NaN vs current NaN (NaN !== NaN)", async () => {
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { n: Number.NaN } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { other: 1 } }),
		});
		const session = {
			id: "s-nan",
			appName: "runner-app14",
			userId: "u1",
			state: { n: Number.NaN, other: 1 },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta).toHaveProperty("n");
		expect(Number.isNaN(delta.n)).toBe(true);
		expect(delta.other).toBeNull();
	});
});
