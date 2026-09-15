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
	invocationId: "twenty-first-loop-max-residual",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-21mr",
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
 * Twenty-first leftover residual deepen (complements #246 twentieth
 * maxIterations true/negzero/`-Infinity`): POSITIVE_INFINITY kept and runs
 * until escalate; `NaN` is falsy via `!maxIterations` → unbounded until
 * escalate; `{}` / `Object(true)` — `{}` zero-runs (`0 < {}` → false);
 * `Object(true)` one run (`0 < 1`).
 */
describe("LoopAgent maxIterations posinf/nan/object-true twenty-first residual deepen", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("POSITIVE_INFINITY maxIterations is kept and runs until escalate", async () => {
		const sub = new MockSubAgent("pos_inf");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			if (calls >= 2) {
				yield new Event({
					author: "pos_inf",
					actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
				});
				return;
			}
			yield new Event({ author: "pos_inf" });
		});
		const agent = new LoopAgent({
			name: "pos_inf_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: Number.POSITIVE_INFINITY as any,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(agent.maxIterations).toBe(Number.POSITIVE_INFINITY);
		expect(calls).toBe(2);
	});

	it("NaN maxIterations is falsy via !maxIterations and stays unbounded until escalate", async () => {
		const sub = new MockSubAgent("nan_max");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			if (calls >= 2) {
				yield new Event({
					author: "nan_max",
					actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
				});
				return;
			}
			yield new Event({ author: "nan_max" });
		});
		const agent = new LoopAgent({
			name: "nan_max_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: Number.NaN as any,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(Number.isNaN(agent.maxIterations as any)).toBe(true);
		expect(calls).toBe(2);
	});

	it("empty-object maxIterations is truthy and runs zero iterations (0 < {})", async () => {
		const sub = new MockSubAgent("empty_obj");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "empty_obj" });
		});
		const empty = {};
		const agent = new LoopAgent({
			name: "empty_obj_loop",
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

	it("Object(true) maxIterations is kept and runs exactly one iteration", async () => {
		const sub = new MockSubAgent("obj_true");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "obj_true" });
		});
		const boxed = Object(true);
		const agent = new LoopAgent({
			name: "obj_true_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: boxed as any,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(agent.maxIterations).toBe(boxed);
		expect(sub.runAsync).toHaveBeenCalledOnce();
		expect(events).toHaveLength(1);
	});

	it("number 1 maxIterations is kept and runs exactly one iteration", async () => {
		const sub = new MockSubAgent("num_one");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "num_one" });
		});
		const agent = new LoopAgent({
			name: "num_one_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 1,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(agent.maxIterations).toBe(1);
		expect(sub.runAsync).toHaveBeenCalledOnce();
	});
});
