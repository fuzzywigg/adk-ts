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
	invocationId: "twenty-second-loop-max-comp",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-max-22c",
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
 * Twenty-second leftover (HEAVY residual complement after open #265 /
 * twentieth maxIterations tip): number `1` runs exactly once; `{}` ToNumbers
 * to NaN → zero runs; `NaN` is falsy so `!maxIterations` → unbounded (capped
 * here by escalate after 2).
 */
describe("LoopAgent maxIterations number-one/empty-object/NaN twenty-second leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("number 1 maxIterations is kept and runs exactly one iteration", async () => {
		const sub = new MockSubAgent("one_max");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "one_max" });
		});
		const agent = new LoopAgent({
			name: "one_max_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 1,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(agent.maxIterations).toBe(1);
		expect(sub.runAsync).toHaveBeenCalledOnce();
		expect(events).toHaveLength(1);
	});

	it("empty-object maxIterations is kept and runs zero iterations (NaN compare)", async () => {
		const sub = new MockSubAgent("obj_max");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "obj_max" });
		});
		const agent = new LoopAgent({
			name: "obj_max_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: {} as any,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(agent.maxIterations).toEqual({});
		expect(sub.runAsync).not.toHaveBeenCalled();
		expect(events).toHaveLength(0);
	});

	it("NaN maxIterations is falsy → unbounded until escalate stops", async () => {
		const sub = new MockSubAgent("nan_max");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			yield new Event({
				author: "nan_max",
				actions: {
					escalate: calls >= 2,
					stateDelta: {},
					artifactDelta: {},
				},
			});
		});
		const agent = new LoopAgent({
			name: "nan_max_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: Number.NaN as any,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(Number.isNaN(agent.maxIterations as any)).toBe(true);
		expect(calls).toBe(2);
		expect(events).toHaveLength(2);
	});
});
