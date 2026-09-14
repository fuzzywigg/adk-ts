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
	invocationId: "thirteenth-loop-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-13",
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
 * Thirteenth leftover: string `"0"` is truthy so `!maxIterations` is false,
 * then `0 < "0"` coerces to `0 < 0` → zero iterations. Distinct from numeric
 * `0`/NaN/null unbounded (fifth) and whitespace zero-runs (twelfth).
 */
describe("LoopAgent maxIterations string-zero zero-runs thirteenth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('string "0" maxIterations runs zero sub-agent iterations', async () => {
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
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(agent.maxIterations).toBe("0");
		expect(sub.runAsync).not.toHaveBeenCalled();
		expect(events).toEqual([]);
	});

	it('string "00" also zero-runs via ToNumber coercion', async () => {
		const sub = new MockSubAgent("dbl_zero");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "dbl_zero" });
		});
		const agent = new LoopAgent({
			name: "dbl_zero_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: "00" as any,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(sub.runAsync).not.toHaveBeenCalled();
	});

	it('string "1" still runs one iteration (control)', async () => {
		const sub = new MockSubAgent("one_str");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "one_str" });
		});
		const agent = new LoopAgent({
			name: "one_str_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: "1" as any,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(sub.runAsync).toHaveBeenCalledTimes(1);
		expect(events).toHaveLength(1);
	});

	it("numeric 0 remains unbounded (fifth control vs string zero)", async () => {
		const sub = new MockSubAgent("num_zero");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			if (calls >= 2) {
				yield new Event({
					author: "num_zero",
					actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
				});
				return;
			}
			yield new Event({ author: "num_zero" });
		});
		const agent = new LoopAgent({
			name: "num_zero_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 0,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(calls).toBe(2);
	});
});
