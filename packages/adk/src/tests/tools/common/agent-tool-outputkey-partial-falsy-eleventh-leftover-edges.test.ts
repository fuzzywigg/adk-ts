import { describe, expect, it, vi } from "vitest";
import { InvocationContext } from "../../../agents/invocation-context";
import type { LlmAgent } from "../../../agents/llm-agent";
import { Event } from "../../../events/event";
import { PluginManager } from "../../../plugins/plugin-manager";
import type { BaseSessionService } from "../../../sessions/base-session-service";
import type { Session } from "../../../sessions/session";
import { AgentTool } from "../../../tools/common/agent-tool";
import { ToolContext } from "../../../tools/tool-context";

function makeSession(): Session {
	return {
		id: "session-eleventh",
		appName: "app",
		userId: "user-1",
		state: {},
		events: [],
		lastUpdateTime: 0,
	};
}

function makeStubAgent(
	overrides: Partial<{
		name: string;
		runAsync: LlmAgent["runAsync"];
	}> = {},
): LlmAgent {
	const name = overrides.name ?? "stub_agent";
	return {
		name,
		description: "Stub agent description",
		instruction: "Answer",
		runAsync:
			overrides.runAsync ??
			async function* () {
				yield new Event({
					author: name,
					content: { role: "model", parts: [{ text: "ok" }] },
				});
			},
	} as LlmAgent;
}

function makeToolContext(agent: LlmAgent) {
	const appendEvent = vi.fn().mockResolvedValue(undefined);
	const sessionService = { appendEvent } as unknown as BaseSessionService;
	const invocationContext = new InvocationContext({
		sessionService,
		pluginManager: new PluginManager(),
		agent,
		session: makeSession(),
		runConfig: {} as any,
		branch: "root",
	});
	return {
		context: new ToolContext(invocationContext),
		appendEvent,
	};
}

/**
 * Eleventh leftover: `if (this.outputKey && context?.state)` skips falsy keys;
 * `if (!event.partial)` still appends 0/"" /false.
 */
describe("AgentTool outputKey + partial falsy eleventh leftover", () => {
	it.each([
		{ label: "empty string", outputKey: "" },
		{ label: "0", outputKey: 0 },
		{ label: "false", outputKey: false },
		{ label: "null", outputKey: null },
	])("does not store under outputKey when key is $label", async ({
		outputKey,
	}) => {
		const agent = makeStubAgent();
		const tool = new AgentTool({
			name: "skip_key",
			agent,
			outputKey: outputKey as any,
		});
		const { context } = makeToolContext(agent);
		const result = await tool.runAsync({ input: "x" }, context);
		expect(result).toBe("ok");
		expect(context.state.toDict()).toEqual({});
	});

	it("stores when outputKey is whitespace-only (truthy)", async () => {
		const agent = makeStubAgent();
		const tool = new AgentTool({
			name: "ws_key",
			agent,
			outputKey: "   ",
		});
		const { context } = makeToolContext(agent);
		await tool.runAsync({ input: "x" }, context);
		expect(context.state["   "]).toBe("ok");
	});

	it.each([
		{ label: "undefined", partial: undefined, appends: true },
		{ label: "false", partial: false, appends: true },
		{ label: "0", partial: 0, appends: true },
		{ label: "empty string", partial: "", appends: true },
		{ label: "true", partial: true, appends: false },
		{ label: "1", partial: 1, appends: false },
		{ label: '"yes"', partial: "yes", appends: false },
	])("partial=$label appends=$appends via !event.partial", async ({
		partial,
		appends,
	}) => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "stub_agent",
					content: { role: "model", parts: [{ text: "ok" }] },
					partial: partial as any,
				});
			},
		});
		const tool = new AgentTool({ name: "partial_gate", agent });
		const { context, appendEvent } = makeToolContext(agent);
		await tool.runAsync({ input: "x" }, context);
		if (appends) {
			expect(appendEvent).toHaveBeenCalledTimes(1);
		} else {
			expect(appendEvent).not.toHaveBeenCalled();
		}
	});
});
