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
	invocationId: "eighth-loop-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-loop-8",
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
 * Eighth leftover: `if (event.actions?.escalate)` residual truthiness.
 * Fifth leftover pinned 1/"yes"/{} / [] stop and 0/""/null continue.
 * Residual: "0"/true stop; false/undefined/NaN continue.
 */
describe("LoopAgent escalate residual truthiness eighth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: '"0"', escalate: "0" },
		{ label: "true", escalate: true },
	])("stops when escalate is truthy $label", async ({ escalate }) => {
		const sub = new MockSubAgent("truthy_esc");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			yield new Event({
				author: "truthy_esc",
				actions: {
					escalate: escalate as any,
					stateDelta: {},
					artifactDelta: {},
				},
			});
		});
		const agent = new LoopAgent({
			name: "truthy_loop",
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

	it.each([
		{ label: "false", escalate: false },
		{ label: "undefined", escalate: undefined },
		{ label: "NaN", escalate: Number.NaN },
	])("continues when escalate is falsy $label under maxIterations", async ({
		escalate,
	}) => {
		const sub = new MockSubAgent("falsy_esc");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({
				author: "falsy_esc",
				actions: {
					escalate: escalate as any,
					stateDelta: {},
					artifactDelta: {},
				},
			});
		});
		const agent = new LoopAgent({
			name: "falsy_loop",
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
});
