import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import type { InvocationContext } from "../../agents/invocation-context";
import { LoopAgent } from "../../agents/loop-agent";
import { Event } from "../../events/event";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";

class MockSubAgent extends BaseAgent {
	runAsync = vi.fn();
	runLive = vi.fn();

	constructor(name: string) {
		super({ name, description: "" });
	}
}

const mockContext: InvocationContext = {
	invocationId: "eighteenth-loop-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-18",
		userId: "user-loop",
		appName: "app-loop",
		state: {},
		events: [],
		lastUpdateTime: 0,
	} as any,
	endInvocation: false,
	sessionService: {} as BaseSessionService,
	pluginManager: new PluginManager(),
	createChildContext: vi.fn(),
} as unknown as InvocationContext;

/**
 * Eighteenth leftover: thirteenth leftover only `"0"` (`0 < 0`). String
 * `"false"` is truthy so `!maxIterations` is false; `0 < "false"` → `0 < NaN`
 * → zero runs — distinct ToNumber path from string zero.
 */
describe("LoopAgent maxIterations string-false NaN zero-runs eighteenth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('string "false" maxIterations is kept and runs zero iterations', async () => {
		const sub = new MockSubAgent("str_false");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "str_false" });
		});
		const agent = new LoopAgent({
			name: "false_str_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: "false" as any,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(agent.maxIterations).toBe("false");
		expect(sub.runAsync).not.toHaveBeenCalled();
		expect(events).toEqual([]);
	});

	it('string "0" still zero-runs (thirteenth control)', async () => {
		const sub = new MockSubAgent("str_zero");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "str_zero" });
		});
		const agent = new LoopAgent({
			name: "zero_str_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: "0" as any,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(sub.runAsync).not.toHaveBeenCalled();
	});

	it("boolean false maxIterations remains unbounded (fifth control)", async () => {
		const sub = new MockSubAgent("bool_false");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			if (calls >= 2) {
				yield new Event({
					author: "bool_false",
					actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
				});
				return;
			}
			yield new Event({ author: "bool_false" });
		});
		const agent = new LoopAgent({
			name: "bool_false_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: false as any,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(calls).toBe(2);
	});
});
