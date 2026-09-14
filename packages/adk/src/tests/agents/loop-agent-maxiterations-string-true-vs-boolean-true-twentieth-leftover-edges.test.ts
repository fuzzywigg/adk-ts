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
 * Twentieth leftover: eighteenth pins `"false"` → NaN zero-runs. String
 * `"true"` is the same ToNumber→NaN path, while boolean `true` coerces to 1
 * and runs exactly once — the residual false-NaN asymmetry after #225.
 * Empty array / NEGATIVE_INFINITY are truthy enterers that also zero-run.
 */
describe("LoopAgent maxIterations string-true vs boolean-true twentieth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('string "true" maxIterations is kept and runs zero iterations (0 < NaN)', async () => {
		const sub = new MockSubAgent("str_true");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "str_true" });
		});
		const agent = new LoopAgent({
			name: "true_str_loop",
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

	it("boolean true maxIterations runs exactly one iteration (0 < 1)", async () => {
		const sub = new MockSubAgent("bool_true");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "bool_true" });
		});
		const agent = new LoopAgent({
			name: "true_bool_loop",
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

	it("empty-array maxIterations is truthy but 0 < [] → 0 < 0 zero-runs", async () => {
		const sub = new MockSubAgent("empty_arr");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "empty_arr" });
		});
		const agent = new LoopAgent({
			name: "arr_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: [] as any,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(agent.maxIterations).toEqual([]);
		expect(sub.runAsync).not.toHaveBeenCalled();
	});

	it("NEGATIVE_INFINITY maxIterations is truthy but 0 < -Inf is false → zero-runs", async () => {
		const sub = new MockSubAgent("neg_inf");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "neg_inf" });
		});
		const agent = new LoopAgent({
			name: "neginf_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: Number.NEGATIVE_INFINITY as any,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(agent.maxIterations).toBe(Number.NEGATIVE_INFINITY);
		expect(sub.runAsync).not.toHaveBeenCalled();
	});

	it('string "false" still zero-runs (eighteenth control)', async () => {
		const sub = new MockSubAgent("str_false");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "str_false" });
		});
		const agent = new LoopAgent({
			name: "false_str_ctrl",
			description: "d",
			subAgents: [sub],
			maxIterations: "false" as any,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(sub.runAsync).not.toHaveBeenCalled();
	});
});
