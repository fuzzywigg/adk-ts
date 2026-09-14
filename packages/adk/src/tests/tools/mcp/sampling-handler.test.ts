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

	it("uses modelPreferences hints and converts LlmResponse parts", async () => {
		const { LlmResponse } = await import("../../../models/llm-response");
		const samplingHandler = vi.fn(
			async () =>
				new LlmResponse({
					content: {
						role: "model",
						parts: [
							{ text: "part-a" },
							{ text: "part-b" },
							{ inlineData: {} as any },
						],
					},
				}),
		) as SamplingHandler;

		const handler = new McpSamplingHandler(samplingHandler);
		const response = await handler.handleSamplingRequest(
			textRequest({
				modelPreferences: { hints: [{ name: "gpt-test" }, {}] },
			}),
		);

		expect(response.model).toBe("gpt-test");
		expect(response.content).toEqual({ type: "text", text: "part-apart-b" });
	});

	it("converts string LlmResponse.content and updateHandler swaps behavior", async () => {
		const { LlmResponse } = await import("../../../models/llm-response");
		const handler = new McpSamplingHandler(
			async () => new LlmResponse({ content: "plain-string" as any }),
		);
		await expect(handler.handleSamplingRequest(textRequest())).resolves.toEqual(
			{
				model: "gemini-2.0-flash",
				role: "assistant",
				content: { type: "text", text: "plain-string" },
			},
		);

		handler.updateHandler(async () => "swapped");
		await expect(handler.handleSamplingRequest(textRequest())).resolves.toEqual(
			{
				model: "gemini-2.0-flash",
				role: "assistant",
				content: { type: "text", text: "swapped" },
			},
		);
	});

	it("handles array content and missing media data placeholders", async () => {
		const samplingHandler = vi.fn(async (request) => {
			const parts = request.contents.flatMap((c) => c.parts ?? []);
			expect(parts).toEqual(
				expect.arrayContaining([
					{ text: "chunk-a" },
					{ text: "chunk-b" },
					{ text: "[IMAGE CONTENT MISSING DATA]" },
					{ text: "caption" },
					{ text: "[AUDIO CONTENT MISSING DATA]" },
				]),
			);
			return "ok";
		}) as SamplingHandler;

		const handler = new McpSamplingHandler(samplingHandler);
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				maxTokens: 16,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: "chunk-a" },
							{ type: "text", text: "chunk-b" },
						],
					},
					{
						role: "user",
						content: { type: "image", data: "", mimeType: "image/png" },
					},
					{
						role: "user",
						content: {
							type: "audio",
							text: "caption",
							data: "",
							mimeType: "audio/wav",
						},
					},
				],
			},
		});
		expect(samplingHandler).toHaveBeenCalledOnce();
	});

	it("rethrows McpError from the ADK handler unchanged", async () => {
		const handler = new McpSamplingHandler(async () => {
			throw new McpError("typed", McpErrorType.INVALID_REQUEST_ERROR);
		});
		await expect(
			handler.handleSamplingRequest(textRequest()),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: "typed",
		});
	});

	it("wraps non-Error throws as SAMPLING_ERROR with string message", async () => {
		const handler = new McpSamplingHandler(async () => {
			throw "string-boom";
		});
		await expect(
			handler.handleSamplingRequest(textRequest()),
		).rejects.toMatchObject({
			type: McpErrorType.SAMPLING_ERROR,
			message: expect.stringContaining("string-boom"),
		});
	});

	it("maps unknown content types and default media mime types via converter", () => {
		const handler = new McpSamplingHandler(async () => "ok");
		expect(
			(handler as any).convertMcpContentToADKParts({
				type: "weird-type",
				text: "ignored",
			}),
		).toEqual([{ text: "[Unknown content type]" }]);

		const imageParts = (handler as any).convertMcpContentToADKParts({
			type: "image",
			data: Buffer.from("img").toString("base64"),
		});
		expect(imageParts[0].inlineData).toEqual(
			expect.objectContaining({
				mimeType: "image/jpeg",
				data: Buffer.from("img").toString("base64"),
			}),
		);

		const audioParts = (handler as any).convertMcpContentToADKParts({
			type: "audio",
			data: Buffer.from("aud").toString("base64"),
		});
		expect(audioParts[0].inlineData).toEqual(
			expect.objectContaining({
				mimeType: "audio/mpeg",
				data: Buffer.from("aud").toString("base64"),
			}),
		);
	});

	it("converts empty LlmResponse content into empty assistant text", async () => {
		const handler = new McpSamplingHandler(async () => {
			return { content: undefined } as any;
		});
		const result = await handler.handleSamplingRequest(textRequest());
		expect(result).toMatchObject({
			role: "assistant",
			content: { type: "text", text: "" },
		});
	});

	it("converts LlmResponse with empty parts array into empty text", async () => {
		const handler = new McpSamplingHandler(async () => {
			return { content: { parts: [] } } as any;
		});
		const result = await handler.handleSamplingRequest(textRequest());
		expect(result).toMatchObject({
			role: "assistant",
			content: { type: "text", text: "" },
		});
	});

	it("rejects when convertADKResponseToMcp yields a schema-invalid payload", async () => {
		const handler = new McpSamplingHandler(async () => "ok");
		vi.spyOn(handler as any, "convertADKResponseToMcp").mockReturnValue({
			role: "assistant",
			content: { type: "text", text: "missing-model" },
		});

		await expect(
			handler.handleSamplingRequest(textRequest()),
		).rejects.toMatchObject({
			type: McpErrorType.SAMPLING_ERROR,
			message: expect.stringContaining("Invalid response generated"),
		});
	});

	it("rejects when maxTokens is missing after schema validation bypass", async () => {
		const handler = new McpSamplingHandler(async () => "ok");
		const request = {
			method: "sampling/createMessage",
			params: {
				messages: [{ role: "user", content: { type: "text", text: "hi" } }],
			},
		} as any;
		await expect(handler.handleSamplingRequest(request)).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringMatching(/Invalid sampling request|maxTokens/),
		});
	});
});
