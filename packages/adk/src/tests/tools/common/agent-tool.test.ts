import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { InvocationContext } from "../../../agents/invocation-context";
import { PluginManager } from "../../../plugins/plugin-manager";
import { Event } from "../../../events/event";
import type { BaseSessionService } from "../../../sessions/base-session-service";
import type { Session } from "../../../sessions/session";
import { AgentTool } from "../../../tools/common/agent-tool";
import { ToolContext } from "../../../tools/tool-context";
import type { LlmAgent } from "../../../agents/llm-agent";

function makeSession(): Session {
	return {
		id: "session-1",
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
		description: string;
		instruction: string;
		runAsync: LlmAgent["runAsync"];
	}> = {},
): LlmAgent {
	const name = overrides.name ?? "stub_agent";
	return {
		name,
		description: overrides.description ?? "Stub agent description",
		instruction: overrides.instruction ?? "Answer the user request",
		runAsync:
			overrides.runAsync ??
			async function* () {
				yield new Event({
					author: name,
					content: {
						role: "model",
						parts: [{ text: "hello from agent" }],
					},
				});
			},
	} as LlmAgent;
}

function makeToolContext(agent: LlmAgent): {
	context: ToolContext;
	appendEvent: ReturnType<typeof vi.fn>;
} {
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

describe("AgentTool", () => {
	it("exposes constructor metadata from config and agent", () => {
		const agent = makeStubAgent({
			description: "Agent description",
		});
		const tool = new AgentTool({
			name: "research_agent",
			agent,
		});

		expect(tool.name).toBe("research_agent");
		expect(tool.description).toBe("Agent description");
		expect(tool.isLongRunning).toBe(false);
	});

	it("returns a default declaration from agent instruction", () => {
		const agent = makeStubAgent({
			instruction: "Research the given topic thoroughly",
		});
		const tool = new AgentTool({
			name: "research_agent",
			agent,
		});
		const declaration = tool.getDeclaration();

		expect(declaration.name).toBe("research_agent");
		expect(declaration.description).toBe("Research the given topic thoroughly");
		expect(declaration.parameters?.required).toEqual(["input"]);
		expect(declaration.parameters?.properties?.input).toEqual({
			type: Type.STRING,
			description: "The input to provide to the agent",
		});
	});

	it("returns a custom functionDeclaration when provided", () => {
		const agent = makeStubAgent();
		const custom = {
			name: "custom_schema",
			description: "Custom schema",
			parameters: {
				type: Type.OBJECT,
				properties: {
					topic: { type: Type.STRING, description: "Topic" },
				},
				required: ["topic"],
			},
		};
		const tool = new AgentTool({
			name: "research_agent",
			agent,
			functionDeclaration: custom,
		});

		expect(tool.getDeclaration()).toEqual(custom);
	});

	it("runs the agent, collects text, and stores outputKey in state", async () => {
		const agent = makeStubAgent({
			name: "writer",
			runAsync: async function* () {
				yield new Event({
					author: "writer",
					content: {
						role: "model",
						parts: [{ text: "line one" }, { text: "line two" }],
					},
				});
			},
		});
		const tool = new AgentTool({
			name: "writer_tool",
			agent,
			outputKey: "agent_output",
		});
		const { context, appendEvent } = makeToolContext(agent);

		const result = await tool.runAsync({ input: "write something" }, context);

		expect(result).toBe("line one\nline two");
		expect(context.state.agent_output).toBe("line one\nline two");
		expect(appendEvent).toHaveBeenCalled();
	});

	it("sets isLongRunning and accepts skipSummarization config", () => {
		const agent = makeStubAgent();
		const tool = new AgentTool({
			name: "long_tool",
			agent,
			isLongRunning: true,
			skipSummarization: true,
		});

		expect(tool.isLongRunning).toBe(true);
		expect((tool as any).skipSummarization).toBe(true);
	});

	it("wraps errors thrown by agent.runAsync", async () => {
		const agent = makeStubAgent({
			runAsync: async function* () {
				yield new Event({
					author: "other",
					content: { role: "model", parts: [] },
				});
				throw new Error("agent crashed");
			},
		});
		const tool = new AgentTool({
			name: "failing_tool",
			agent,
		});
		const { context } = makeToolContext(agent);

		await expect(tool.runAsync({ input: "go" }, context)).rejects.toThrow(
			"Agent tool execution failed: agent crashed",
		);
	});
});
