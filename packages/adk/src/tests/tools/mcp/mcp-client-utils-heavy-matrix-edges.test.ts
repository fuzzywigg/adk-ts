import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import type { BaseTool } from "../../../tools/base/base-tool";
import {
	adkToMcpToolType,
	declarationToJsonSchema,
	jsonSchemaToDeclaration,
	mcpSchemaToParameters,
	normalizeJsonSchema,
} from "../../../tools/mcp/schema-conversion";
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
import { retryOnClosedResource, withRetry } from "../../../tools/mcp/utils";

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

describe("MCP client utils heavy matrix edges", () => {
	it("withRetry returns without calling reinit on success", async () => {
		const instance = { value: 7 };
		const fn = vi.fn(async function (this: typeof instance) {
			return this.value;
		});
		const reinit = vi.fn(async () => undefined);
		await expect(withRetry(fn, instance, reinit)()).resolves.toBe(7);
		expect(reinit).not.toHaveBeenCalled();
	});

	it("withRetry retries closed / ECONNRESET / socket hang up", async () => {
		const instance = {};
		const reinit = vi.fn(async () => undefined);
		for (const message of ["resource closed", "ECONNRESET", "socket hang up"]) {
			let attempts = 0;
			const fn = vi.fn(async () => {
				attempts++;
				if (attempts === 1) throw new Error(message);
				return "ok";
			});
			await expect(withRetry(fn, instance, reinit, 1)()).resolves.toBe("ok");
		}
		expect(reinit).toHaveBeenCalledTimes(3);
	});

	it("withRetry throws immediately for non-closed errors", async () => {
		const reinit = vi.fn(async () => undefined);
		const fn = vi.fn(async () => {
			throw new Error("permission denied");
		});
		await expect(withRetry(fn, {}, reinit, 3)()).rejects.toThrow(
			"permission denied",
		);
		expect(reinit).not.toHaveBeenCalled();
	});

	it("withRetry wraps reinit failures", async () => {
		const reinit = vi.fn(async () => {
			throw new Error("reinit boom");
		});
		const fn = vi.fn(async () => {
			throw new Error("connection closed");
		});
		await expect(withRetry(fn, {}, reinit, 1)()).rejects.toThrow(
			"Failed to reinitialize resources",
		);
	});

	it("withRetry exhausts maxRetries and rethrows", async () => {
		const reinit = vi.fn(async () => undefined);
		const fn = vi.fn(async () => {
			throw new Error("closed");
		});
		await expect(withRetry(fn, {}, reinit, 1)()).rejects.toThrow("closed");
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("retryOnClosedResource wraps method descriptors", async () => {
		const reinit = vi.fn(async () => undefined);
		let attempts = 0;
		class Sample {
			async work(): Promise<string> {
				attempts++;
				if (attempts === 1) throw new Error("closed");
				return "done";
			}
		}
		const descriptor = Object.getOwnPropertyDescriptor(
			Sample.prototype,
			"work",
		)!;
		retryOnClosedResource(() => reinit(), 1)(
			Sample.prototype,
			"work",
			descriptor,
		);
		Object.defineProperty(Sample.prototype, "work", descriptor);
		await expect(new Sample().work()).resolves.toBe("done");
		expect(reinit).toHaveBeenCalledTimes(1);
	});

	it("retryOnClosedResource returns descriptor unchanged when value missing", () => {
		const descriptor: TypedPropertyDescriptor<() => Promise<string>> = {};
		const result = retryOnClosedResource(async () => undefined)(
			{},
			"x",
			descriptor,
		);
		expect(result).toBe(descriptor);
	});

	it("declarationToJsonSchema returns {} without parameters", () => {
		expect(declarationToJsonSchema({ name: "noop", description: "" })).toEqual(
			{},
		);
	});

	it("declarationToJsonSchema returns properties when present", () => {
		expect(
			declarationToJsonSchema({
				name: "tool",
				description: "d",
				parameters: {
					type: Type.OBJECT,
					properties: { q: { type: Type.STRING } },
				},
			}),
		).toEqual({ q: { type: Type.STRING } });
	});

	it("declarationToJsonSchema returns whole parameters when properties absent", () => {
		expect(
			declarationToJsonSchema({
				name: "tool",
				description: "d",
				parameters: { type: Type.OBJECT, required: ["q"] } as any,
			}),
		).toEqual({ type: Type.OBJECT, required: ["q"] });
	});

	it("jsonSchemaToDeclaration wraps bare property maps", () => {
		const declaration = jsonSchemaToDeclaration("search", "find", {
			query: { type: "string" },
		});
		expect(declaration.parameters).toEqual({
			type: Type.OBJECT,
			properties: { query: { type: "string" } },
		});
	});

	it("jsonSchemaToDeclaration preserves typed schemas and defaults undefined", () => {
		expect(
			jsonSchemaToDeclaration("typed", "d", {
				type: "object",
				properties: { a: { type: "number" } },
			}).parameters,
		).toEqual({ type: "object", properties: { a: { type: "number" } } });
		expect(jsonSchemaToDeclaration("empty", "d", undefined).parameters).toEqual(
			{ type: Type.OBJECT, properties: {} },
		);
	});

	it("normalizeJsonSchema infers object/array/string shapes", () => {
		expect(
			normalizeJsonSchema({
				properties: { name: { type: "string" } },
				required: ["name"],
			}),
		).toMatchObject({ type: Type.OBJECT, required: ["name"] });
		expect(normalizeJsonSchema({ items: { type: "number" } })).toEqual({
			type: Type.ARRAY,
			items: { type: "number" },
		});
		expect(normalizeJsonSchema({ type: "string", minLength: 2 })).toEqual({
			type: Type.STRING,
			minLength: 2,
		});
		expect(normalizeJsonSchema(null as any)).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("normalizeJsonSchema covers boolean/null/integer", () => {
		expect(normalizeJsonSchema({ type: "boolean" })).toEqual({
			type: Type.BOOLEAN,
		});
		expect(normalizeJsonSchema({ type: "null" })).toEqual({ type: Type.NULL });
		expect(
			normalizeJsonSchema({ type: "integer", minimum: 1, maximum: 5 }),
		).toEqual({ type: "integer", minimum: 1, maximum: 5 });
	});

	it("adkToMcpToolType maps declaration to MCP inputSchema", () => {
		const tool = {
			name: "lookup",
			description: "find things",
			getDeclaration: () => ({
				name: "lookup",
				description: "find things",
				parameters: {
					type: Type.OBJECT,
					properties: { id: { type: Type.STRING } },
				},
			}),
		} as BaseTool;
		expect(adkToMcpToolType(tool)).toEqual({
			name: "lookup",
			description: "find things",
			inputSchema: {
				type: "object",
				properties: { id: { type: Type.STRING } },
			},
		});
	});

	it("mcpSchemaToParameters normalizes MCP tool inputSchema", () => {
		expect(
			mcpSchemaToParameters({
				name: "t",
				inputSchema: {
					type: "object",
					properties: { q: { type: "string" } },
				},
			} as any),
		).toEqual({
			type: Type.OBJECT,
			properties: {
				q: { type: Type.STRING },
			},
		});
	});

	it("McpErrorType exposes stable string values", () => {
		expect(McpErrorType.CONNECTION_ERROR).toBe("connection_error");
		expect(McpErrorType.TOOL_EXECUTION_ERROR).toBe("tool_execution_error");
		expect(McpErrorType.RESOURCE_CLOSED_ERROR).toBe("resource_closed_error");
		expect(McpErrorType.TIMEOUT_ERROR).toBe("timeout_error");
		expect(McpErrorType.INVALID_SCHEMA_ERROR).toBe("invalid_schema_error");
		expect(McpErrorType.SAMPLING_ERROR).toBe("SAMPLING_ERROR");
		expect(McpErrorType.INVALID_REQUEST_ERROR).toBe("INVALID_REQUEST_ERROR");
	});

	it("McpError sets name, type, message, and optional originalError", () => {
		const original = new Error("root");
		const err = new McpError("failed", McpErrorType.CONNECTION_ERROR, original);
		expect(err.name).toBe("McpError");
		expect(err.type).toBe(McpErrorType.CONNECTION_ERROR);
		expect(err.originalError).toBe(original);
		expect(
			new McpError("t", McpErrorType.TIMEOUT_ERROR).originalError,
		).toBeUndefined();
	});

	it("McpSamplingHandler rejects non-sampling methods", async () => {
		const handler = new McpSamplingHandler(async () => "ok");
		await expect(
			handler.handleSamplingRequest({
				method: "tools/call",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "x" } }],
					maxTokens: 1,
				},
			} as McpSamplingRequest),
		).rejects.toMatchObject({ type: McpErrorType.INVALID_REQUEST_ERROR });
	});

	it("McpSamplingHandler rejects schema-invalid requests", async () => {
		const handler = new McpSamplingHandler(async () => "ok");
		await expect(
			handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: { messages: "not-an-array", maxTokens: 10 },
			} as unknown as McpSamplingRequest),
		).rejects.toMatchObject({ type: McpErrorType.INVALID_REQUEST_ERROR });
	});

	it("McpSamplingHandler rejects non-positive maxTokens", async () => {
		const handler = new McpSamplingHandler(async () => "ok");
		await expect(
			handler.handleSamplingRequest(textRequest({ maxTokens: 0 })),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: expect.stringContaining("maxTokens"),
		});
	});

	it("McpSamplingHandler converts text requests and returns string replies", async () => {
		const samplingHandler = vi.fn(
			async () => "assistant-reply",
		) as SamplingHandler;
		const handler = new McpSamplingHandler(samplingHandler);
		const response = await handler.handleSamplingRequest(
			textRequest({ systemPrompt: "sys" }),
		);
		expect(response).toEqual({
			model: "gemini-2.0-flash",
			role: "assistant",
			content: { type: "text", text: "assistant-reply" },
		});
	});

	it("McpSamplingHandler wraps handler errors as SAMPLING_ERROR", async () => {
		const handler = new McpSamplingHandler(async () => {
			throw new Error("llm down");
		});
		await expect(
			handler.handleSamplingRequest(textRequest()),
		).rejects.toMatchObject({
			type: McpErrorType.SAMPLING_ERROR,
			message: expect.stringContaining("llm down"),
		});
	});

	it("McpSamplingHandler converts image/audio/tool content parts", async () => {
		const imageData = Buffer.from("img").toString("base64");
		const audioData = Buffer.from("aud").toString("base64");
		const samplingHandler = vi.fn(async (request) => {
			const parts = request.contents.flatMap((c: any) => c.parts ?? []);
			expect(parts).toEqual(
				expect.arrayContaining([
					{ inlineData: { data: imageData, mimeType: "image/png" } },
					{ inlineData: { data: audioData, mimeType: "audio/wav" } },
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
						content: [
							{ type: "image", data: imageData, mimeType: "image/png" },
							{ type: "audio", data: audioData, mimeType: "audio/wav" },
							{ type: "tool_use", name: "search", id: "x", input: {} },
							{
								type: "tool_result",
								toolUseId: "call-1",
								content: [{ type: "text", text: "ok" }],
							},
						],
					},
				],
			},
		} as any);
	});

	it("createSamplingHandler returns the same function", () => {
		const fn = async () => "x";
		expect(createSamplingHandler(fn)).toBe(fn);
	});

	it("McpSamplingHandler converts LlmResponse-like objects via text extraction", async () => {
		const { LlmResponse } = await import("../../../models/llm-response");
		const handler = new McpSamplingHandler(
			async () =>
				new LlmResponse({
					content: { role: "model", parts: [{ text: "structured" }] },
				}),
		);
		const response = await handler.handleSamplingRequest(textRequest());
		expect(response.model).toBe("gemini-2.0-flash");
		expect(response.content).toEqual({ type: "text", text: "structured" });
	});

	it("normalizeJsonSchema keeps lowercase number type string as-is", () => {
		expect(normalizeJsonSchema({ type: "number" })).toEqual({
			type: "number",
		});
	});

	it("withRetry passes arguments through to the wrapped function", async () => {
		const fn = vi.fn(async (a: number, b: number) => a + b);
		const wrapped = withRetry(fn, {}, async () => undefined);
		await expect(wrapped(2, 3)).resolves.toBe(5);
		expect(fn).toHaveBeenCalledWith(2, 3);
	});

	it("McpError is instanceof Error", () => {
		const err = new McpError("x", McpErrorType.INVALID_SCHEMA_ERROR);
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(McpError);
	});
});
