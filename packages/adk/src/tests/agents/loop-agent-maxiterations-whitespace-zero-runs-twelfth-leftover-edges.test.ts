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
	invocationId: "twelfth-loop-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-12",
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
 * Twelfth leftover: `while (!maxIterations || timesLooped < maxIterations)`.
 * Fifth leftover: falsy null/NaN/0 unbounded. Whitespace is truthy so
 * `!maxIterations` is false and `0 < " "` is `0 < 0` → zero iterations.
 */
describe("LoopAgent maxIterations whitespace zero-runs twelfth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: "single space", maxIterations: " " },
		{ label: "spaces", maxIterations: "  " },
		{ label: "tab", maxIterations: "\t" },
	])("$label maxIterations runs zero sub-agent iterations", async ({
		maxIterations,
	}) => {
		const sub = new MockSubAgent("ws_max");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "ws_max" });
		});
		const agent = new LoopAgent({
			name: "ws_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: maxIterations as any,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(sub.runAsync).not.toHaveBeenCalled();
		expect(events).toEqual([]);
	});

	it("false maxIterations is still unbounded (fifth control vs whitespace)", async () => {
		const sub = new MockSubAgent("false_max");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			if (calls >= 2) {
				yield new Event({
					author: "false_max",
					actions: { escalate: true, stateDelta: {}, artifactDelta: {} },
				});
				return;
			}
			yield new Event({ author: "false_max" });
		});
		const agent = new LoopAgent({
			name: "false_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: false as any,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(calls).toBe(2);
	});

	it("numeric 1 still caps one iteration (control)", async () => {
		const sub = new MockSubAgent("one");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({ author: "one" });
		});
		const agent = new LoopAgent({
			name: "one_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 1,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(sub.runAsync).toHaveBeenCalledTimes(1);
		expect(events).toHaveLength(1);
	});
});
