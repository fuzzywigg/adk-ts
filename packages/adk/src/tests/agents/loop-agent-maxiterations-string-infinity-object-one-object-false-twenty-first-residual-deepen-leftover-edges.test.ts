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
	invocationId: "twenty-first-loop-max-str-inf",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-21sm",
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
 * Twenty-first leftover residual deepen (complements #284 posinf/nan/object-true):
 * string `"Infinity"` kept and runs until escalate (ToNumber → +Infinity);
 * `Object(1)` one-run; `Object(false)` truthy but zero-runs (`0 < 0`).
 */
describe("LoopAgent maxIterations string-infinity/object-one/object-false twenty-first residual deepen", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('string "Infinity" maxIterations is kept and runs until escalate', async () => {
		const sub = new MockSubAgent("str_inf");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			if (calls >= 2) {
				yield new Event({
					author: "str_inf",
					actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
				});
				return;
			}
			yield new Event({ author: "str_inf" });
		});
		const agent = new LoopAgent({
			name: "str_inf_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: "Infinity" as any,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(agent.maxIterations).toBe("Infinity");
		expect(calls).toBe(2);
	});

	it("Object(1) maxIterations is kept and runs exactly one iteration", async () => {
		const sub = new MockSubAgent("obj_one");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "obj_one" });
		});
		const boxed = Object(1);
		const agent = new LoopAgent({
			name: "obj_one_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: boxed as any,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(agent.maxIterations).toBe(boxed);
		expect(sub.runAsync).toHaveBeenCalledOnce();
	});

	it("Object(false) maxIterations is truthy and runs zero iterations (0 < 0)", async () => {
		const sub = new MockSubAgent("obj_false");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "obj_false" });
		});
		const boxed = Object(false);
		const agent = new LoopAgent({
			name: "obj_false_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: boxed as any,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(agent.maxIterations).toBe(boxed);
		expect(sub.runAsync).not.toHaveBeenCalled();
		expect(events).toEqual([]);
	});
});
