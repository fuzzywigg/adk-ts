import { beforeEach, describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Twentieth leftover: rewind state compare uses `!==` (SameValueZero-ish via
 * Object.is for NaN only — `-0 !== 0` is false in JS, so `-0` at rewind vs `0`
 * current is treated as equal and omitted from the delta). Contrasts seventh
 * leftover object-reference inequality.
 */
describe("runners rewind state -0 vs 0 SameValueZero twentieth leftover", () => {
	let sessionService: InMemorySessionService;
	let runner: Runner;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		const agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
		});
	});

	it("omits key when rewind holds -0 and current holds 0 (JS -0 === 0)", async () => {
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { n: -0 } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { n: 1 } }),
		});
		const session = {
			id: "s-negzero",
			appName: "runner-app",
			userId: "u1",
			state: { n: 0 },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta).not.toHaveProperty("n");
	});

	it("includes key when rewind holds 1 and current holds 0", async () => {
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { n: 1 } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { n: 0 } }),
		});
		const session = {
			id: "s-one",
			appName: "runner-app",
			userId: "u1",
			state: { n: 0 },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta.n).toBe(1);
	});

	it("keeps false at rewind (not deleted via === null/undefined gate)", async () => {
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { flag: false } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { flag: true } }),
		});
		const session = {
			id: "s-false",
			appName: "runner-app",
			userId: "u1",
			state: { flag: true },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta.flag).toBe(false);
	});
});
