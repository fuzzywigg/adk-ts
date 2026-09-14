import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../../agents/base-agent";
import type { InvocationContext } from "../../../agents/invocation-context";
import { LoopAgent } from "../../../agents/loop-agent";
import { Event } from "../../../events/event";
import { PluginManager } from "../../../plugins/plugin-manager";
import type { BaseSessionService } from "../../../sessions/base-session-service";
import { ExitLoopTool } from "../../../tools/common/exit-loop-tool";
import type { ToolContext } from "../../../tools/tool-context";

class MockSubAgent extends BaseAgent {
	runAsync = vi.fn();
	runLive = vi.fn();

	constructor(name: string) {
		super({ name, description: "" });
	}
}

const mockContext: InvocationContext = {
	invocationId: "fifth-exit-inv",
	agent: {} as any,
	branch: "",
	session: {
		id: "ses-exit-fifth",
		userId: "user-exit",
		appName: "app-exit",
		state: {},
		events: [],
		lastUpdateTime: 0,
	} as any,
	endInvocation: false,
	sessionService: {} as BaseSessionService,
	pluginManager: new PluginManager(),
	createChildContext: vi.fn(),
} as unknown as InvocationContext;

describe("ExitLoopTool + LoopAgent fifth leftover — escalate integration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("ExitLoopTool escalate=true stops LoopAgent on the same event", async () => {
		const exit = new ExitLoopTool();
		const actions: Record<string, unknown> = {
			stateDelta: {},
			artifactDelta: {},
		};
		const toolCtx = { actions } as ToolContext;
		await exit.runAsync({}, toolCtx);

		const sub = new MockSubAgent("exit_sub");
		let calls = 0;
		sub.runAsync.mockImplementation(async function* () {
			calls++;
			yield new Event({
				author: "exit_sub",
				actions: actions as any,
			});
		});
		const agent = new LoopAgent({
			name: "exit_loop_agent",
			description: "d",
			subAgents: [sub],
			maxIterations: 5,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(actions.escalate).toBe(true);
		expect(calls).toBe(1);
		expect(events).toHaveLength(1);
	});

	it("ExitLoopTool overwriting escalate=0 still stops the loop (truthy true)", async () => {
		const exit = new ExitLoopTool();
		const actions: Record<string, unknown> = {
			escalate: 0,
			stateDelta: {},
			artifactDelta: {},
		};
		await exit.runAsync({}, { actions } as ToolContext);
		expect(actions.escalate).toBe(true);

		const sub = new MockSubAgent("overwrite_sub");
		sub.runAsync.mockImplementation(async function* () {
			yield new Event({
				author: "overwrite_sub",
				actions: actions as any,
			});
		});
		const agent = new LoopAgent({
			name: "overwrite_loop",
			description: "d",
			subAgents: [sub],
			maxIterations: 4,
		});
		const events: Event[] = [];
		for await (const event of agent["runAsyncImpl"](mockContext)) {
			events.push(event);
		}
		expect(sub.runAsync).toHaveBeenCalledTimes(1);
		expect(events).toHaveLength(1);
	});
});
