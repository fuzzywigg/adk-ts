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
	invocationId: "twenty-second-loop-posinf-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-22",
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
 * Twenty-second leftover (HEAVY tip-relaunch residual after tip #258–#261):
 * twentieth pins true/`"true"`/`-0`/`NEGATIVE_INFINITY`/`[]` maxIterations.
 * Assert `POSITIVE_INFINITY` stays truthy and remains unbounded
 * (`0 < Infinity` forever until escalate) — residual +Inf asymmetry.
 */
describe("LoopAgent maxIterations posinf twenty-second leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("POSITIVE_INFINITY maxIterations is kept and remains unbounded until escalate", async () => {
		const sub = new MockSubAgent("pos_inf");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			if (calls >= 3) {
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
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(agent.maxIterations).toBe(Number.POSITIVE_INFINITY);
		expect(calls).toBe(3);
		expect(events).toHaveLength(3);
	});

	it("NEGATIVE_INFINITY still zero-runs (twentieth control asymmetry)", async () => {
		const sub = new MockSubAgent("neg_inf_ctrl");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "neg_inf_ctrl" });
		});
		const agent = new LoopAgent({
			name: "neg_inf_ctrl_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: Number.NEGATIVE_INFINITY as any,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(sub.runAsync).not.toHaveBeenCalled();
	});
});
