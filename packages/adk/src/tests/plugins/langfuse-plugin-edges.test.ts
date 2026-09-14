import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { LlmResponse } from "../../models/llm-response";
import type { BaseTool } from "../../tools/base/base-tool";

const {
	traceMock,
	eventMock,
	spanMock,
	generationMock,
	updateMock,
	endMock,
	flushAsync,
	shutdownAsync,
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
	const flushAsync = vi.fn().mockResolvedValue(undefined);
	const shutdownAsync = vi.fn().mockResolvedValue(undefined);
	const LangfuseMock = vi.fn(function Langfuse(this: any) {
		this.trace = traceMock;
		this.flushAsync = flushAsync;
		this.shutdownAsync = shutdownAsync;
	});
	return {
		traceMock,
		eventMock,
		spanMock,
		generationMock,
		updateMock,
		endMock,
		flushAsync,
		shutdownAsync,
		LangfuseMock,
	};
});

vi.mock("langfuse", () => ({
	Langfuse: LangfuseMock,
}));

import { LangfusePlugin } from "../../plugins/langfuse-plugin";

function makeInvocation(overrides: Record<string, unknown> = {}) {
	return {
		invocationId: "inv-edge",
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

describe("LangfusePlugin leftover edges (TOKENMAXX post #124)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		spanMock.mockImplementation(() => ({
			update: updateMock,
			end: endMock,
			event: eventMock,
			span: spanMock,
			generation: generationMock,
		}));
		generationMock.mockImplementation(() => ({
			update: updateMock,
			end: endMock,
		}));
		traceMock.mockImplementation(() => ({
			update: updateMock,
			event: eventMock,
			span: spanMock,
			generation: generationMock,
		}));
	});

	it("getGenerationKey falls back to unknown when model is omitted", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation();
		const callbackContext = makeCallbackContext(inv);

		await plugin.beforeAgentCallback({
			agent: inv.agent,
			callbackContext,
		});

		const llmRequest = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
		});
		(llmRequest as any).model = undefined;

		await plugin.beforeModelCallback({ callbackContext, llmRequest });
		expect((plugin as any).generations.has("inv-edge:gen:unknown")).toBe(true);
	});

	it("getGenerationKey treats empty-string model as unknown", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect((plugin as any).getGenerationKey("inv-x", "")).toBe(
			"inv-x:gen:unknown",
		);
		expect((plugin as any).getGenerationKey("inv-x", "gpt")).toBe(
			"inv-x:gen:gpt",
		);
	});

	it("truncates onUserMessageCallback textPreview to 200 chars", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const long = "x".repeat(250);
		const inv = makeInvocation();

		await plugin.onUserMessageCallback({
			invocationContext: inv,
			userMessage: { role: "user", parts: [{ text: long }] },
		});

		expect(eventMock).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "user_message",
				metadata: expect.objectContaining({
					textPreview: long.slice(0, 200),
				}),
			}),
		);
		const preview = eventMock.mock.calls.find(
			(c) => c[0]?.name === "user_message",
		)?.[0]?.metadata?.textPreview;
		expect(preview).toHaveLength(200);
	});

	it("recordTokenUsage coalesces undefined usage fields to 0", async () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const inv = makeInvocation();
		const callbackContext = makeCallbackContext(inv);

		await plugin.beforeAgentCallback({
			agent: inv.agent,
			callbackContext,
		});

		const llmRequest = new LlmRequest({
			model: "gemini-2.5-flash",
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
		});
		await plugin.beforeModelCallback({ callbackContext, llmRequest });
		await plugin.afterModelCallback({
			callbackContext,
			llmRequest,
			llmResponse: new LlmResponse({
				content: { role: "model", parts: [{ text: "ok" }] },
				text: "ok",
				usageMetadata: {},
			}),
		});

		expect((plugin as any).tokenUsage.get("inv-edge")).toEqual({
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
		});
	});

	it("toPlainText returns String(data) when JSON.stringify throws on circular input", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		const circular: any = { a: 1 };
		circular.self = circular;
		const text = (plugin as any).toPlainText(circular);
		expect(typeof text).toBe("string");
		expect(text.length).toBeGreaterThan(0);
	});

	it("getToolSpanKey falls back to unknown without functionCallId", () => {
		const plugin = new LangfusePlugin({ publicKey: "pk", secretKey: "sk" });
		expect((plugin as any).getToolSpanKey("inv-t")).toBe("inv-t:tool:unknown");
		expect(makeTool().name).toBe("search");
	});
});
