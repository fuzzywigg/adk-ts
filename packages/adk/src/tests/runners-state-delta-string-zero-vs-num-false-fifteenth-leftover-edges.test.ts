import { beforeEach, describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fifteenth leftover (HEAVY tip-relaunch residual after tip #269 / 03ff90a8 after providers; supersedes closed #273/#262): fourteenth leftover pins `true` vs `"true"` /
 * array-ref `!==`. Sibling of rewind-state string restore — string `"0"` /
 * `"false"` vs numeric `0` / boolean `false` are `!==` so keys re-emit.
 */
describe("runners state-delta string-zero vs num/false fifteenth leftover", () => {
	let runner: Runner;

	beforeEach(() => {
		runner = new Runner({
			appName: "runner-app15-state",
			agent: new LlmAgent({
				name: "root_agent",
				model: "gemini-2.0-flash-exp",
			}),
			sessionService: new InMemorySessionService(),
		});
	});

	it('includes key when rewind "0" vs current numeric 0 (strict !==)', async () => {
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { v: "0" } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { other: 1 } }),
		});
		const session = {
			id: "s-str0-vs-num0",
			appName: "runner-app15-state",
			userId: "u1",
			state: { v: 0, other: 1 },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta.v).toBe("0");
		expect(delta.other).toBeNull();
	});

	it('includes key when rewind "false" vs current boolean false', async () => {
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { flag: "false" } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { other: 1 } }),
		});
		const session = {
			id: "s-strfalse-vs-bool",
			appName: "runner-app15-state",
			userId: "u1",
			state: { flag: false, other: 1 },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta.flag).toBe("false");
		expect(delta.other).toBeNull();
	});

	it('omits key when rewind and current both hold string "0"', async () => {
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { v: "0" } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { other: 1 } }),
		});
		const session = {
			id: "s-same-str0",
			appName: "runner-app15-state",
			userId: "u1",
			state: { v: "0", other: 1 },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta.v).toBeUndefined();
		expect(delta.other).toBeNull();
	});
});
