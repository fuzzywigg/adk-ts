import { beforeEach, describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fifteenth residual deepen (HEAVY tip-relaunch residual after tip 1f70668 (post #282/#284); supersedes closed #281/#285/#273/#262
 * — `false` kept (not deleted via `=== null/undefined`); string `"0"`/`"false"`
 * restored when current differs.
 */
describe("runners rewind state false/string-zero fifteenth residual deepen", () => {
	let sessionService: InMemorySessionService;
	let runner: Runner;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		const agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		runner = new Runner({
			appName: "runner-app15",
			agent,
			sessionService,
		});
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
			appName: "runner-app15",
			userId: "u1",
			state: { flag: true },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta.flag).toBe(false);
	});

	it.each([
		{ label: "string-zero", rewind: "0", current: "1" },
		{ label: "string-false", rewind: "false", current: "true" },
	])("restores $label when current differs", async ({
		label,
		rewind,
		current,
	}) => {
		const before = new Event({
			author: "root_agent",
			invocationId: "inv-a",
			actions: new EventActions({ stateDelta: { v: rewind } }),
		});
		const after = new Event({
			author: "root_agent",
			invocationId: "inv-b",
			actions: new EventActions({ stateDelta: { v: current } }),
		});
		const session = {
			id: `s-${label}`,
			appName: "runner-app15",
			userId: "u1",
			state: { v: current },
			events: [before, after],
			lastUpdateTime: 0,
		};

		const delta = await (runner as any)._computeStateDeltaForRewind(session, 1);
		expect(delta.v).toBe(rewind);
	});
});
