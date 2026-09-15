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
	invocationId: "twenty-second-loop-esc",
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
 * twenty-first pins escalate true/`"true"`/`[]`/`-0`. Assert ±Infinity
 * stop via `if (escalate)` — residual sentinel deepen.
 */
describe("LoopAgent escalate infinity twenty-second leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("stops when escalate is $label", async ({ value }) => {
		const sub = new MockSubAgent("inf_esc");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			yield new Event({
				author: "inf_esc",
				actions: {
					escalate: value as any,
					stateDelta: {},
					artifactDelta: {},
				},
			});
		});
		const agent = new LoopAgent({
			name: "inf_esc_loop",
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

	it("SameValueZero -0 escalate still continues (twenty-first control)", async () => {
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
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(sub.runAsync).toHaveBeenCalledTimes(2);
	});
});
