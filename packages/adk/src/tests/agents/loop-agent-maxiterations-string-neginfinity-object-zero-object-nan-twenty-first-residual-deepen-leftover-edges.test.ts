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
	invocationId: "twenty-first-loop-max-str-neginf",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-21nm",
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
 * Twenty-first leftover residual deepen (complements #292 string-inf/obj-one/obj-false):
 * string `"-Infinity"` / `Object(0)` / `Object(NaN)` kept but zero-runs
 * (`0 < -Infinity|0|NaN` is false; boxed values are truthy so not unbounded).
 */
describe("LoopAgent maxIterations string-neginfinity/object-zero/object-nan twenty-first residual deepen", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('string "-Infinity" maxIterations is kept and runs zero iterations', async () => {
		const sub = new MockSubAgent("str_neginf");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "str_neginf" });
		});
		const agent = new LoopAgent({
			name: "str_neginf_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: "-Infinity" as any,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(agent.maxIterations).toBe("-Infinity");
		expect(sub.runAsync).not.toHaveBeenCalled();
		expect(events).toEqual([]);
	});

	it("Object(0) maxIterations is truthy and runs zero iterations (0 < 0)", async () => {
		const sub = new MockSubAgent("obj_zero");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "obj_zero" });
		});
		const boxed = Object(0);
		const agent = new LoopAgent({
			name: "obj_zero_loop",
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

	it("Object(NaN) maxIterations is truthy and runs zero iterations (0 < NaN)", async () => {
		const sub = new MockSubAgent("obj_nan");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "obj_nan" });
		});
		const boxed = Object(Number.NaN);
		const agent = new LoopAgent({
			name: "obj_nan_loop",
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
