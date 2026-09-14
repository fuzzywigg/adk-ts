import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";
import type { BaseTool } from "../../tools/base/base-tool";
import { ToolContext } from "../../tools/tool-context";

const { eventMock, updateMock, LangfuseMock } = vi.hoisted(() => {
	const updateMock = vi.fn();
	const endMock = vi.fn();
	const eventMock = vi.fn();
	const toolSpan = {
		update: updateMock,
		end: endMock,
		event: eventMock,
	};
	const generation = {
		update: updateMock,
		end: endMock,
	};
	const spanMock = vi.fn(() => ({
		update: updateMock,
		end: endMock,
		event: eventMock,
		span: vi.fn(() => toolSpan),
		generation: vi.fn(() => generation),
	}));
	const generationMock = vi.fn(() => generation);
	const traceMock = vi.fn(() => ({
		update: updateMock,
		event: eventMock,
		span: spanMock,
		generation: generationMock,
	}));
	const flushAsync = vi.fn().mockResolvedValue(undefined);
	const shutdownAsync = vi.fn().mockResolvedValue(undefined);
	const LangfuseMock = vi.fn(function Langfuse(this: any) {
		this.trace = traceMock;
		this.flushAsync = flushAsync;
		this.shutdownAsync = shutdownAsync;
	});
	return {
		eventMock,
		updateMock,
		LangfuseMock,
	};
});

vi.mock("langfuse", () => ({
	Langfuse: LangfuseMock,
}));

import { LangfusePlugin } from "../../plugins/langfuse-plugin";

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

describe("LangfusePlugin matrix edges (TOKENMAXX leftovers)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("toPlainText unwraps nested content wrappers via afterToolCallback", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-tool-nested" });
		const callbackContext = makeCallbackContext(inv);
		await plugin.beforeAgentCallback({
			agent: inv.agent,
			callbackContext,
		});
		const toolContext = new ToolContext(inv, { functionCallId: "fc-nested" });
		await plugin.beforeToolCallback({
			tool: makeTool("nested"),
			toolArgs: {},
			toolContext,
		});
		updateMock.mockClear();

		await plugin.afterToolCallback({
			tool: makeTool("nested"),
			toolArgs: {},
			toolContext,
			result: {
				content: { role: "model", parts: [{ text: "nested-via-tool" }] },
			},
		});

		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({
					resultPreview: "nested-via-tool",
				}),
			}),
		);
	});

	it("toPlainText unwraps nested content inside Content arrays and direct wrappers", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect(
			(plugin as any).toPlainText([
				{ content: { role: "model", parts: [{ text: "a" }] } },
				{ content: { role: "user", parts: [{ text: "b" }] } },
			]),
		).toBe("a\n\nb");
		expect(
			(plugin as any).toPlainText({
				content: { role: "model", parts: [{ text: "direct" }] },
			}),
		).toBe("direct");
	});

	it.each([
		{ label: "undefined parts", content: { role: "user" } },
		{ label: "null parts", content: { role: "user", parts: null } },
	])("serializeContent uses [] for $label", ({ content }) => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect((plugin as any).serializeContent(content)).toEqual({
			role: "user",
			parts: [],
		});
	});

	it.each([
		{ label: "missing data", inlineData: { mimeType: "image/png" } },
		{ label: "null data", inlineData: { mimeType: "image/png", data: null } },
		{
			label: "undefined data",
			inlineData: { mimeType: "image/png", data: undefined },
		},
	])("serializePart dataSize falls back to 0 for $label", ({ inlineData }) => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect((plugin as any).serializePart({ inlineData })).toEqual({
			inlineData: { mimeType: "image/png", dataSize: 0 },
		});
	});

	it("recordTokenUsage no-ops when usage is missing and coalesces nullish counts", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		(plugin as any).recordTokenUsage("inv-missing");
		(plugin as any).recordTokenUsage("inv-missing", undefined);
		(plugin as any).recordTokenUsage("inv-missing", null);
		expect((plugin as any).tokenUsage.has("inv-missing")).toBe(false);

		(plugin as any).recordTokenUsage("inv-partial", {});
		expect((plugin as any).tokenUsage.get("inv-partial")).toEqual({
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
		});

		(plugin as any).recordTokenUsage("inv-partial", {
			input: 2,
			output: undefined,
			total: null,
		});
		expect((plugin as any).tokenUsage.get("inv-partial")).toEqual({
			inputTokens: 2,
			outputTokens: 0,
			totalTokens: 0,
		});
	});

	it("afterRunCallback prefers serialized output when outputText is empty", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-empty-text" });
		await plugin.beforeRunCallback({ invocationContext: inv });
		updateMock.mockClear();
		eventMock.mockClear();

		await plugin.afterRunCallback({
			invocationContext: inv,
			result: {
				content: { role: "model", parts: [] },
			},
		});

		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				output: {
					role: "model",
					parts: [],
				},
			}),
		);
	});

	it("afterModelCallback records usageMetadata with undefined token fields via ?? 0", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation({ invocationId: "inv-usage" });
		const callbackContext = makeCallbackContext(inv);
		const llmRequest = new LlmRequest({
			model: "gemini-2.5-flash",
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
		});
		await plugin.beforeAgentCallback({
			agent: inv.agent,
			callbackContext,
		});
		await plugin.beforeModelCallback({
			callbackContext,
			llmRequest,
		});

		await plugin.afterModelCallback({
			callbackContext,
			llmRequest,
			llmResponse: new LlmResponse({
				content: { role: "model", parts: [{ text: "ok" }] },
				usageMetadata: {
					promptTokenCount: undefined,
					candidatesTokenCount: undefined,
					totalTokenCount: undefined,
				} as any,
			}),
		});

		expect((plugin as any).tokenUsage.get("inv-usage")).toEqual({
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
		});
	});
});
