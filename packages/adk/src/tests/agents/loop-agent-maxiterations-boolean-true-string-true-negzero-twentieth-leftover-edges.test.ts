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
	invocationId: "twentieth-loop-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-20",
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
 * Twentieth leftover: eighteenth pins `"false"` → `0 < NaN` zero-runs.
 * Boolean `true` keeps and runs exactly once (`0 < true` → `0 < 1`); string
 * `"true"` shares the NaN zero-run path with `"false"` — true asymmetry.
 * `-0` SameValueZero-falsy → unbounded; `-Infinity` / `[]` → zero runs.
 */
describe("LoopAgent maxIterations boolean-true/string-true/negzero twentieth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("boolean true maxIterations is kept and runs exactly one iteration", async () => {
		const sub = new MockSubAgent("bool_true");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "bool_true" });
		});
		const agent = new LoopAgent({
			name: "bool_true_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: true as any,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(agent.maxIterations).toBe(true);
		expect(sub.runAsync).toHaveBeenCalledOnce();
		expect(events).toHaveLength(1);
	});

	it('string "true" maxIterations is kept and runs zero iterations (NaN path)', async () => {
		const sub = new MockSubAgent("str_true");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "str_true" });
		});
		const agent = new LoopAgent({
			name: "str_true_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: "true" as any,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(agent.maxIterations).toBe("true");
		expect(sub.runAsync).not.toHaveBeenCalled();
		expect(events).toEqual([]);
	});

	it("SameValueZero -0 maxIterations is falsy and remains unbounded", async () => {
		const sub = new MockSubAgent("neg_zero");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			if (calls >= 2) {
				yield new Event({
					author: "neg_zero",
					actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
				});
				return;
			}
			yield new Event({ author: "neg_zero" });
		});
		const agent = new LoopAgent({
			name: "neg_zero_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: -0 as any,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(Object.is(agent.maxIterations, -0)).toBe(true);
		expect(calls).toBe(2);
	});

	it("NEGATIVE_INFINITY maxIterations is kept and runs zero iterations", async () => {
		const sub = new MockSubAgent("neg_inf");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "neg_inf" });
		});
		const agent = new LoopAgent({
			name: "neg_inf_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: Number.NEGATIVE_INFINITY as any,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(agent.maxIterations).toBe(Number.NEGATIVE_INFINITY);
		expect(sub.runAsync).not.toHaveBeenCalled();
		expect(events).toEqual([]);
	});

	it("empty-array maxIterations is truthy and runs zero iterations (0 < [])", async () => {
		const sub = new MockSubAgent("empty_arr");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "empty_arr" });
		});
		const empty: never[] = [];
		const agent = new LoopAgent({
			name: "empty_arr_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: empty as any,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(agent.maxIterations).toBe(empty);
		expect(sub.runAsync).not.toHaveBeenCalled();
		expect(events).toEqual([]);
	});

	it('string "false" still zero-runs (eighteenth control asymmetry)', async () => {
		const sub = new MockSubAgent("str_false");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "str_false" });
		});
		const agent = new LoopAgent({
			name: "str_false_ctrl",
			description: "d",
			subAgents: [sub],
			maxIterations: "false" as any,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(sub.runAsync).not.toHaveBeenCalled();
	});
});
