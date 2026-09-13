import { describe, expect, it, vi } from "vitest";
import { LlmRequest, LlmResponse } from "@adk/models";
import {
	createSamplingHandler,
	McpSamplingHandler,
} from "../../../tools/mcp/sampling-handler";
import { McpError, McpErrorType } from "../../../tools/mcp/types";

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

function textRequest(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		method: "sampling/createMessage",
		params: {
			messages: [
				{
					role: "user",
					content: { type: "text", text: "hello" },
				},
			],
			maxTokens: 64,
			...overrides,
		},
	};
}

describe("McpSamplingHandler", () => {
	it("rejects non-sampling methods", async () => {
		const handler = new McpSamplingHandler(async () => "ok");
		await expect(
			handler.handleSamplingRequest({
				method: "tools/list",
				params: {},
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
		});
	});

	it("rejects schema-invalid requests", async () => {
		const handler = new McpSamplingHandler(async () => "ok");
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: { maxTokens: 10 },
			} as any),
		).rejects.toBeInstanceOf(McpError);
	});

	it("rejects non-positive maxTokens", async () => {
		const handler = new McpSamplingHandler(async () => "ok");
		await expect(
			handler.handleSamplingRequest(textRequest({ maxTokens: 0 }) as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("maxTokens"),
		});
	});

	it("converts text messages and returns string responses", async () => {
		let captured: LlmRequest | undefined;
		const handler = new McpSamplingHandler(async (request) => {
			captured = request;
			return "pong";
		});

		const response = await handler.handleSamplingRequest(
			textRequest({
				systemPrompt: "be brief",
				temperature: 0.2,
				modelPreferences: { hints: [{ name: "fake-model" }] },
			}) as any,
		);

		expect(captured?.model).toBe("fake-model");
		expect(captured?.config?.temperature).toBe(0.2);
		expect(captured?.config?.maxOutputTokens).toBe(64);
		expect(captured?.contents?.[0]).toEqual({
			role: "user",
			parts: [{ text: "be brief" }],
		});
		expect(captured?.contents?.[1]).toEqual({
			role: "user",
			parts: [{ text: "hello" }],
		});
		expect(response).toEqual({
			model: "fake-model",
			role: "assistant",
			content: { type: "text", text: "pong" },
		});
	});

	it("maps assistant role to model and LlmResponse parts to text", async () => {
		const handler = new McpSamplingHandler(
			async () =>
				new LlmResponse({
					content: {
						role: "model",
						parts: [{ text: "part-a" }, { text: "part-b" }],
					},
				}),
		);

		const response = await handler.handleSamplingRequest(
			textRequest({
				messages: [
					{
						role: "assistant",
						content: { type: "text", text: "prior" },
					},
					{
						role: "user",
						content: { type: "text", text: "next" },
					},
				],
			}) as any,
		);

		expect(response.content).toEqual({ type: "text", text: "part-apart-b" });
		expect(response.model).toBe("gemini-2.0-flash");
	});

	it("converts image and audio content with and without data", async () => {
		let captured: LlmRequest | undefined;
		const handler = new McpSamplingHandler(async (request) => {
			captured = request;
			return "ok";
		});

		await handler.handleSamplingRequest(
			textRequest({
				messages: [
					{
						role: "user",
						content: {
							type: "image",
							data: "aW1n",
							mimeType: "image/png",
						},
					},
					{
						role: "user",
						content: {
							type: "audio",
							data: "YQ==",
							mimeType: "audio/mpeg",
						},
					},
					{
						role: "user",
						content: {
							type: "text",
							text: "after media",
						},
					},
				],
			}) as any,
		);

		const parts = (captured?.contents || []).flatMap((c) => c.parts || []);
		expect(parts).toEqual(
			expect.arrayContaining([
				{
					inlineData: { data: "aW1n", mimeType: "image/png" },
				},
				{
					inlineData: { data: "YQ==", mimeType: "audio/mpeg" },
				},
				{ text: "after media" },
			]),
		);
	});

	it("converts tool_use and tool_result content into placeholder text parts", async () => {
		let captured: LlmRequest | undefined;
		const handler = new McpSamplingHandler(async (request) => {
			captured = request;
			return "ok";
		});

		await handler.handleSamplingRequest(
			textRequest({
				messages: [
					{
						role: "assistant",
						content: {
							type: "tool_use",
							name: "search",
							id: "call-1",
							input: { q: "x" },
						},
					},
					{
						role: "user",
						content: {
							type: "tool_result",
							toolUseId: "call-1",
							content: [{ type: "text", text: "hit" }],
						},
					},
				],
			}) as any,
		);

		const parts = (captured?.contents || []).flatMap((c) => c.parts || []);
		expect(parts).toEqual(
			expect.arrayContaining([
				{ text: "[Tool Use: search]" },
				{ text: "[Tool Result: call-1]" },
			]),
		);
	});

	it("places placeholder text when image data is missing", async () => {
		let captured: LlmRequest | undefined;
		const handler = new McpSamplingHandler(async (request) => {
			captured = request;
			return "ok";
		});

		await handler.handleSamplingRequest(
			textRequest({
				messages: [
					{
						role: "user",
						content: {
							type: "image",
							data: "",
							mimeType: "image/png",
						},
					},
				],
			}) as any,
		);

		expect(captured?.contents?.[0]?.parts).toEqual([
			{ text: "[IMAGE CONTENT MISSING DATA]" },
		]);
	});

	it("wraps unexpected handler errors as McpError", async () => {
		const handler = new McpSamplingHandler(async () => {
			throw new Error("boom");
		});

		await expect(
			handler.handleSamplingRequest(textRequest() as any),
		).rejects.toMatchObject({
			type: McpErrorType.SAMPLING_ERROR,
			message: expect.stringContaining("boom"),
		});
	});

	it("updateHandler swaps the underlying sampling handler", async () => {
		const handler = new McpSamplingHandler(async () => "first");
		handler.updateHandler(async () => "second");
		const response = await handler.handleSamplingRequest(textRequest() as any);
		expect(response.content).toEqual({ type: "text", text: "second" });
	});

	it("createSamplingHandler returns the same function", () => {
		const fn = async () => "x";
		expect(createSamplingHandler(fn)).toBe(fn);
	});
});
