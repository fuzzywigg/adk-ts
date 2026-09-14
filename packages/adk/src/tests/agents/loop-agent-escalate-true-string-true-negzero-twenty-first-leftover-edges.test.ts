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
	invocationId: "twenty-first-loop-esc",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-21",
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
 * Twenty-first leftover: fourteenth pins escalate `"0"`/`"false"` stop.
 * Assert boolean `true` / `"true"` stop via `if (escalate)`; SameValueZero
 * `-0` continues under maxIterations — residual true asymmetry after
 * twentieth maxIterations tip.
 */
describe("LoopAgent escalate true/string-true/negzero twenty-first leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("stops when escalate is $label", async ({ value }) => {
		const sub = new MockSubAgent("true_esc");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			yield new Event({
				author: "true_esc",
				actions: {
					escalate: value as any,
					stateDelta: {},
					artifactDelta: {},
				},
			});
		});
		const agent = new LoopAgent({
			name: "true_esc_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 5,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(calls).toBe(1);
		expect(events).toHaveLength(1);
	});

	it("SameValueZero -0 escalate still continues under maxIterations", async () => {
		const sub = new MockSubAgent("neg0_esc");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({
				author: "neg0_esc",
				actions: {
					escalate: -0 as any,
					stateDelta: {},
					artifactDelta: {},
				},
			});
		});
		const agent = new LoopAgent({
			name: "neg0_esc_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 2,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(sub.runAsync).toHaveBeenCalledTimes(2);
		expect(events).toHaveLength(2);
	});

	it("empty-array escalate is truthy and stops", async () => {
		const sub = new MockSubAgent("arr_esc");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			yield new Event({
				author: "arr_esc",
				actions: {
					escalate: [] as any,
					stateDelta: {},
					artifactDelta: {},
				},
			});
		});
		const agent = new LoopAgent({
			name: "arr_esc_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 5,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(calls).toBe(1);
	});

	it('string "false" still stops (fourteenth control asymmetry)', async () => {
		const sub = new MockSubAgent("str_false_esc");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({
				author: "str_false_esc",
				actions: {
					escalate: "false" as any,
					stateDelta: {},
					artifactDelta: {},
				},
			});
		});
		const agent = new LoopAgent({
			name: "str_false_esc_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 5,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(sub.runAsync).toHaveBeenCalledOnce();
	});
});
