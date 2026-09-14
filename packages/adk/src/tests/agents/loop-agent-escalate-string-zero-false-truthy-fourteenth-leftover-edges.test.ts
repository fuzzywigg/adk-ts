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
	invocationId: "fourteenth-loop-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-14",
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
 * Fourteenth leftover: `if (event.actions?.escalate)` stops on truthy strings
 * `"0"` / `"false"` that look falsy. Fifth leftover used `1`/`"yes"`/`{}`/`[]`
 * and falsy `0`/`""`/`null` — not these lookalike strings.
 */
describe("LoopAgent escalate string-zero/false truthy fourteenth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("stops when escalate is truthy string $label", async ({ value }) => {
		const sub = new MockSubAgent("str_esc");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			yield new Event({
				author: "str_esc",
				actions: {
					escalate: value as any,
					stateDelta: {},
					artifactDelta: {},
				},
			});
		});
		const agent = new LoopAgent({
			name: "str_esc_loop",
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

	it("numeric 0 escalate still continues under maxIterations (fifth control)", async () => {
		const sub = new MockSubAgent("num_esc");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({
				author: "num_esc",
				actions: {
					escalate: 0 as any,
					stateDelta: {},
					artifactDelta: {},
				},
			});
		});
		const agent = new LoopAgent({
			name: "num_esc_loop",
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

	it("boolean false escalate still continues (fifth control)", async () => {
		const sub = new MockSubAgent("bool_esc");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({
				author: "bool_esc",
				actions: {
					escalate: false,
					stateDelta: {},
					artifactDelta: {},
				},
			});
		});
		const agent = new LoopAgent({
			name: "bool_esc_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 2,
		});
		for await (const _ of agent["runAsyncImpl"](mockContext)) {
		}
		expect(sub.runAsync).toHaveBeenCalledTimes(2);
	});
});
