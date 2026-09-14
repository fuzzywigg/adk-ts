import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmResponse } from "../../../models/llm-response";
import { McpError, McpErrorType } from "../../../tools/mcp/types";
import {
	McpSamplingHandler,
	createSamplingHandler,
} from "../../../tools/mcp/sampling-handler";

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

function baseRequest(overrides: Record<string, unknown> = {}) {
	return {
		method: "sampling/createMessage",
		params: {
			messages: [
				{
					role: "user",
					content: { type: "text", text: "hello" },
				},
			],
			maxTokens: 16,
			...overrides,
		},
	} as any;
}

describe("McpSamplingHandler message matrix leftover edges (post #141)", () => {
	let handlerFn: ReturnType<typeof vi.fn>;
	let handler: McpSamplingHandler;

	beforeEach(() => {
		handlerFn = vi.fn(async () => "ok");
		handler = new McpSamplingHandler(handlerFn);
	});

	it("rejects non-createMessage methods", async () => {
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/other",
				params: { messages: [], maxTokens: 1 },
			} as any),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
		});
	});

	it.each([
		0,
		-1,
		null,
		undefined,
	])("rejects non-positive maxTokens=%j", async (maxTokens) => {
		await expect(
			handler.handleSamplingRequest(baseRequest({ maxTokens })),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("maxTokens"),
		});
	});

	it("rejects missing messages array", async () => {
		await expect(
			handler.handleSamplingRequest(
				baseRequest({ messages: undefined, maxTokens: 8 }),
			),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
		});
	});

	it("prepends systemPrompt as user-role content before messages", async () => {
		await handler.handleSamplingRequest(
			baseRequest({ systemPrompt: "SYS", maxTokens: 8 }),
		);
		const adkRequest = handlerFn.mock.calls[0][0];
		expect(adkRequest.contents[0]).toEqual({
			role: "user",
			parts: [{ text: "SYS" }],
		});
		expect(adkRequest.contents[1].parts[0].text).toBe("hello");
	});

	it.each([
		{
			hints: [{ name: "model-a" }, { name: "model-b" }],
			expected: "model-a",
		},
		{ hints: [{ name: undefined }, { name: "model-b" }], expected: "model-b" },
		{ hints: [{}, { name: "model-c" }], expected: "model-c" },
		{ hints: [], expected: "gemini-2.0-flash" },
		{ hints: undefined, expected: "gemini-2.0-flash" },
	])("modelPreferences.hints → $expected", async ({ hints, expected }) => {
		await handler.handleSamplingRequest(
			baseRequest({
				maxTokens: 8,
				modelPreferences: hints === undefined ? undefined : { hints },
			}),
		);
		expect(handlerFn.mock.calls[0][0].model).toBe(expected);
	});

	it("convertMcpContentToADKParts covers text/image/audio/tool/unknown arms", () => {
		const convert = (handler as any).convertMcpContentToADKParts.bind(handler);
		expect(convert({ type: "text", text: "t" })).toEqual([{ text: "t" }]);
		expect(convert({ type: "text", text: 123 })).toEqual([{ text: "" }]);

		const image = convert({
			type: "image",
			data: "imgdata",
			mimeType: "image/png",
			text: "caption",
		});
		expect(image).toEqual([
			{ text: "caption" },
			{ inlineData: { data: "imgdata", mimeType: "image/png" } },
		]);

		expect(convert({ type: "audio", data: "auddata" })).toEqual([
			{ inlineData: { data: "auddata", mimeType: "audio/mpeg" } },
		]);
		expect(convert({ type: "image", data: "" })).toEqual([
			{ text: "[IMAGE CONTENT MISSING DATA]" },
		]);
		expect(convert({ type: "tool_use", name: "search" })).toEqual([
			{ text: "[Tool Use: search]" },
		]);
		expect(convert({ type: "tool_result", toolUseId: "tr1" })).toEqual([
			{ text: "[Tool Result: tr1]" },
		]);
		expect(convert({ type: "unknown_type" })).toEqual([
			{ text: "[Unknown content type]" },
		]);
		expect(
			convert([
				{ type: "text", text: "a" },
				{ type: "text", text: "b" },
			]),
		).toEqual([{ text: "a" }, { text: "b" }]);
	});

	it("convertSingleMcpMessageToADK maps assistant→model and user→user", () => {
		const convert = (handler as any).convertSingleMcpMessageToADK.bind(handler);
		expect(
			convert({ role: "assistant", content: { type: "text", text: "x" } }).role,
		).toBe("model");
		expect(
			convert({ role: "user", content: { type: "text", text: "y" } }).role,
		).toBe("user");
	});

	it("converts string handler responses and LlmResponse parts", async () => {
		handlerFn.mockResolvedValueOnce("plain");
		const stringResult = await handler.handleSamplingRequest(
			baseRequest({ maxTokens: 4 }),
		);
		expect(stringResult.content).toEqual({ type: "text", text: "plain" });

		handlerFn.mockResolvedValueOnce(
			new LlmResponse({
				content: {
					role: "model",
					parts: [{ text: "a" }, { text: "b" }, { inlineData: {} as any }],
				},
			}),
		);
		const llmResult = await handler.handleSamplingRequest(
			baseRequest({ maxTokens: 4 }),
		);
		expect(llmResult.content).toEqual({ type: "text", text: "ab" });
	});

	it("converts LlmResponse with string content field", async () => {
		handlerFn.mockResolvedValueOnce(
			new LlmResponse({ content: "direct-string" as any }),
		);
		const result = await handler.handleSamplingRequest(
			baseRequest({ maxTokens: 4 }),
		);
		expect(result.content).toEqual({ type: "text", text: "direct-string" });
	});

	it("rethrows McpError unchanged and wraps generic Error / non-Error", async () => {
		handlerFn.mockRejectedValueOnce(
			new McpError("typed", McpErrorType.TIMEOUT_ERROR),
		);
		await expect(
			handler.handleSamplingRequest(baseRequest({ maxTokens: 4 })),
		).rejects.toMatchObject({ type: McpErrorType.TIMEOUT_ERROR });

		handlerFn.mockRejectedValueOnce(new Error("generic"));
		await expect(
			handler.handleSamplingRequest(baseRequest({ maxTokens: 4 })),
		).rejects.toMatchObject({
			type: McpErrorType.SAMPLING_ERROR,
			message: expect.stringContaining("generic"),
		});

		handlerFn.mockRejectedValueOnce("string-fail");
		await expect(
			handler.handleSamplingRequest(baseRequest({ maxTokens: 4 })),
		).rejects.toMatchObject({
			type: McpErrorType.SAMPLING_ERROR,
			message: expect.stringContaining("string-fail"),
		});
	});

	it("updateHandler replaces the underlying sampling function", async () => {
		const next = vi.fn(async () => "next");
		handler.updateHandler(next);
		await handler.handleSamplingRequest(baseRequest({ maxTokens: 4 }));
		expect(next).toHaveBeenCalled();
		expect(handlerFn).not.toHaveBeenCalled();
	});

	it("createSamplingHandler returns the same function reference", () => {
		const fn = async () => "x";
		expect(createSamplingHandler(fn as any)).toBe(fn);
	});

	it("schema validation rejects non-string text before conversion", async () => {
		await expect(
			handler.handleSamplingRequest(
				baseRequest({
					maxTokens: 4,
					messages: [
						{
							role: "user",
							content: { type: "text", text: 123 as any },
						},
					],
				}),
			),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
		});
	});
});
