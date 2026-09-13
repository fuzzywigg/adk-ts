import { describe, expect, it, vi } from "vitest";
import {
	createSamplingHandler,
	McpSamplingHandler,
} from "../../../tools/mcp/sampling-handler";
import {
	McpError,
	McpErrorType,
	type McpSamplingRequest,
	type SamplingHandler,
} from "../../../tools/mcp/types";

function textRequest(
	overrides: Partial<McpSamplingRequest["params"]> = {},
): McpSamplingRequest {
	return {
		method: "sampling/createMessage",
		params: {
			messages: [{ role: "user", content: { type: "text", text: "hello" } }],
			maxTokens: 64,
			...overrides,
		},
	};
}

describe("McpError", () => {
	it("sets name, type, and optional originalError", () => {
		const original = new Error("root");
		const err = new McpError("failed", McpErrorType.SAMPLING_ERROR, original);
		expect(err.name).toBe("McpError");
		expect(err.message).toBe("failed");
		expect(err.type).toBe(McpErrorType.SAMPLING_ERROR);
		expect(err.originalError).toBe(original);
	});
});

describe("McpSamplingHandler", () => {
	it("rejects non-sampling methods", async () => {
		const handler = new McpSamplingHandler(async () => "ok");
		await expect(
			handler.handleSamplingRequest({
				method: "tools/call",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "x" } }],
					maxTokens: 1,
				},
			} as McpSamplingRequest),
		).rejects.toMatchObject({
			name: "McpError",
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("Invalid method"),
		});
	});

	it("rejects schema-invalid requests", async () => {
		const handler = new McpSamplingHandler(async () => "ok");
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					messages: "not-an-array",
					maxTokens: 10,
				},
			} as unknown as McpSamplingRequest),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("Invalid sampling request"),
		});
	});

	it("rejects non-positive maxTokens", async () => {
		const handler = new McpSamplingHandler(async () => "ok");
		await expect(
			handler.handleSamplingRequest(textRequest({ maxTokens: 0 })),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("maxTokens"),
		});
	});

	it("converts text requests and returns string handler responses", async () => {
		const samplingHandler = vi.fn(async (request) => {
			expect(request.contents?.[0]?.parts?.[0]).toEqual({ text: "sys" });
			expect(request.contents?.[1]?.parts?.[0]).toEqual({ text: "hello" });
			expect(request.config?.maxOutputTokens).toBe(64);
			return "assistant-reply";
		}) as SamplingHandler;

		const handler = new McpSamplingHandler(samplingHandler);
		const response = await handler.handleSamplingRequest(
			textRequest({ systemPrompt: "sys" }),
		);

		expect(response).toEqual({
			model: "gemini-2.0-flash",
			role: "assistant",
			content: { type: "text", text: "assistant-reply" },
		});
		expect(samplingHandler).toHaveBeenCalledOnce();
	});

	it("wraps handler errors as SAMPLING_ERROR", async () => {
		const handler = new McpSamplingHandler(async () => {
			throw new Error("llm down");
		});

		await expect(
			handler.handleSamplingRequest(textRequest()),
		).rejects.toMatchObject({
			name: "McpError",
			type: McpErrorType.SAMPLING_ERROR,
			message: expect.stringContaining("llm down"),
		});
	});

	it("converts image, audio, and tool content into ADK parts", async () => {
		const imageData = Buffer.from("img").toString("base64");
		const audioData = Buffer.from("aud").toString("base64");
		const samplingHandler = vi.fn(async (request) => {
			const parts = request.contents.flatMap((c) => c.parts ?? []);
			expect(parts).toEqual(
				expect.arrayContaining([
					{
						inlineData: {
							data: imageData,
							mimeType: "image/png",
						},
					},
					{
						inlineData: {
							data: audioData,
							mimeType: "audio/wav",
						},
					},
					{ text: "[Tool Use: search]" },
					{ text: "[Tool Result: call-1]" },
				]),
			);
			return "done";
		}) as SamplingHandler;

		const handler = new McpSamplingHandler(samplingHandler);
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				maxTokens: 32,
				messages: [
					{
						role: "user",
						content: {
							type: "image",
							data: imageData,
							mimeType: "image/png",
						},
					},
					{
						role: "user",
						content: {
							type: "audio",
							data: audioData,
							mimeType: "audio/wav",
						},
					},
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
			},
		});

		expect(samplingHandler).toHaveBeenCalledOnce();
	});

	it("createSamplingHandler returns the same function", async () => {
		const fn = async () => "x";
		expect(createSamplingHandler(fn)).toBe(fn);
	});
});
