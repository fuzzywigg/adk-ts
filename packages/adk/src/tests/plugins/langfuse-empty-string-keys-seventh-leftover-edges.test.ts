import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	traceMock,
	eventMock,
	spanMock,
	generationMock,
	updateMock,
	endMock,
	LangfuseMock,
} = vi.hoisted(() => {
	const updateMock = vi.fn();
	const endMock = vi.fn();
	const eventMock = vi.fn();
	const spanMock = vi.fn(() => ({
		update: updateMock,
		end: endMock,
		event: eventMock,
		span: vi.fn(),
		generation: vi.fn(),
	}));
	const generationMock = vi.fn(() => ({
		update: updateMock,
		end: endMock,
	}));
	const traceMock = vi.fn(() => ({
		update: updateMock,
		event: eventMock,
		span: spanMock,
		generation: generationMock,
	}));
	const LangfuseMock = vi.fn(function Langfuse(this: any) {
		this.trace = traceMock;
		this.flushAsync = vi.fn().mockResolvedValue(undefined);
		this.shutdownAsync = vi.fn().mockResolvedValue(undefined);
	});
	return {
		traceMock,
		eventMock,
		spanMock,
		generationMock,
		updateMock,
		endMock,
		LangfuseMock,
	};
});

vi.mock("langfuse", () => ({
	Langfuse: LangfuseMock,
}));

import { LlmRequest } from "../../models/llm-request";
import { LangfusePlugin } from "../../plugins/langfuse-plugin";
import type { BaseTool } from "../../tools/base/base-tool";
import { ToolContext } from "../../tools/tool-context";

function makeInvocation(overrides: Record<string, unknown> = {}) {
	return {
		invocationId: "inv-1",
		userId: "user-1",
		appName: "app",
		branch: "main",
		userContent: { role: "user", parts: [{ text: "hello" }] },
		session: { id: "sess-1", state: {} },
		agent: {
			name: "root",
			constructor: { name: "LlmAgent" },
			parentAgent: undefined,
			subAgents: [],
			description: "root agent",
		},
		...overrides,
	} as any;
}

function makeCallbackContext(invocation = makeInvocation()) {
	return {
		invocationId: invocation.invocationId,
		agentName: invocation.agent.name,
		invocationContext: invocation,
	} as any;
}

function makeTool(name = "search"): BaseTool {
	return {
		name,
		description: "search",
		isLongRunning: false,
		shouldRetryOnFailure: false,
		maxRetryAttempts: 0,
		constructor: { name: "FunctionTool" },
	} as BaseTool;
}

describe("Langfuse empty-string keys + model seventh leftover (post #158)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("getToolSpanKey uses unknown for empty-string functionCallId via ||", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect((plugin as any).getToolSpanKey("inv-1", "")).toBe(
			"inv-1:tool:unknown",
		);
		expect((plugin as any).getToolSpanKey("inv-1", undefined)).toBe(
			"inv-1:tool:unknown",
		);
	});

	it("getGenerationKey uses unknown for empty-string model via ||", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect((plugin as any).getGenerationKey("inv-1", "")).toBe(
			"inv-1:gen:unknown",
		);
	});

	it("recordModelUsage no-ops for empty-string model via if (!model)", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		(plugin as any).recordModelUsage("inv-1", "root", "");
		expect((plugin as any).modelsUsed.size).toBe(0);
	});

	it("beforeToolCallback with empty functionCallId stores under unknown key", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const invocation = makeInvocation();
		await plugin.beforeAgentCallback({
			agent: invocation.agent,
			callbackContext: makeCallbackContext(invocation),
		});

		const toolContext = new ToolContext(invocation);
		(toolContext as any).functionCallId = "";

		await plugin.beforeToolCallback({
			tool: makeTool(),
			toolArgs: {},
			toolContext,
		});

		expect((plugin as any).toolSpans.has("inv-1:tool:unknown")).toBe(true);
	});

	it("beforeModelCallback with empty model stores generation under unknown key", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const invocation = makeInvocation();
		await plugin.beforeAgentCallback({
			agent: invocation.agent,
			callbackContext: makeCallbackContext(invocation),
		});

		const request = new LlmRequest({ model: "" });
		await plugin.beforeModelCallback({
			callbackContext: makeCallbackContext(invocation),
			llmRequest: request,
		});

		expect((plugin as any).generations.has("inv-1:gen:unknown")).toBe(true);
		const agentSpan = (plugin as any).agentSpans.get("inv-1:agent:root");
		expect(agentSpan.generation).toHaveBeenCalled();
	});
});
