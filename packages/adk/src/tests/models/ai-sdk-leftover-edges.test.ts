import type { LanguageModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";
import { LlmRequest } from "../../models/llm-request";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	})),
}));

vi.mock("ai", () => ({
	generateText: vi.fn(),
	streamText: vi.fn(),
	jsonSchema: vi.fn((schema: unknown) => ({ schema })),
}));

function makeModel(modelId = "leftover-model"): LanguageModel {
	return {
		modelId,
		provider: "mock",
		specificationVersion: "v2",
	} as unknown as LanguageModel;
}

describe("AiSdkLlm content conversion leftover edges (post #144)", () => {
	const llm = new AiSdkLlm(makeModel());

	describe("contentToAiSdkMessage role × shape matrix", () => {
		it.each([
			{
				label: "empty parts => null",
				content: { role: "user", parts: [] },
				expected: null,
			},
			{
				label: "missing parts => null",
				content: { role: "user" },
				expected: null,
			},
			{
				label: "single text user",
				content: { role: "user", parts: [{ text: "hi" }] },
				expected: { role: "user", content: "hi" },
			},
			{
				label: "single text system",
				content: { role: "system", parts: [{ text: "sys" }] },
				expected: { role: "system", content: "sys" },
			},
			{
				label: "single text model maps assistant",
				content: { role: "model", parts: [{ text: "out" }] },
				expected: { role: "assistant", content: "out" },
			},
			{
				label: "single text assistant",
				content: { role: "assistant", parts: [{ text: "out" }] },
				expected: { role: "assistant", content: "out" },
			},
		])("$label", ({ content, expected }) => {
			expect((llm as any).contentToAiSdkMessage(content)).toEqual(expected);
		});

		it("functionCall branch wins over later functionResponse parts", () => {
			expect(
				(llm as any).contentToAiSdkMessage({
					role: "model",
					parts: [
						{ functionCall: { id: "c1", name: "fn", args: { a: 1 } } },
						{
							functionResponse: {
								id: "c1",
								name: "fn",
								response: { ok: true },
							},
						},
					],
				}),
			).toEqual({
				role: "assistant",
				content: [
					{
						type: "tool-call",
						toolCallId: "c1",
						toolName: "fn",
						input: { a: 1 },
					},
				],
			});
		});

		it.each([
			{
				label: "null response",
				response: null,
				output: { type: "json", value: null },
			},
			{
				label: "undefined response",
				response: undefined,
				output: { type: "json", value: null },
			},
			{
				label: "string response",
				response: "plain",
				output: { type: "text", value: "plain" },
			},
			{
				label: "object response",
				response: { ok: 1 },
				output: { type: "json", value: { ok: 1 } },
			},
			{
				label: "number response",
				response: 42,
				output: { type: "json", value: 42 },
			},
		])("tool-result $label", ({ response, output }) => {
			expect(
				(llm as any).contentToAiSdkMessage({
					role: "user",
					parts: [
						{
							functionResponse: {
								id: "r1",
								name: "tool",
								response,
							},
						},
					],
				}),
			).toEqual({
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: "r1",
						toolName: "tool",
						output,
					},
				],
			});
		});

		it("defaults missing tool result name to unknown", () => {
			expect(
				(llm as any).contentToAiSdkMessage({
					role: "user",
					parts: [{ functionResponse: { id: "r2", response: "x" } }],
				}),
			).toEqual({
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: "r2",
						toolName: "unknown",
						output: { type: "text", value: "x" },
					},
				],
			});
		});

		it.each([
			{
				label: "multi-text system joins",
				role: "system",
				parts: [{ text: "a" }, { text: "b" }],
				expected: { role: "system", content: "ab" },
			},
			{
				label: "multi-text user keeps array",
				role: "user",
				parts: [{ text: "a" }, { text: "b" }],
				expected: {
					role: "user",
					content: [
						{ type: "text", text: "a" },
						{ type: "text", text: "b" },
					],
				},
			},
			{
				label: "multi-text assistant keeps array",
				role: "assistant",
				parts: [{ text: "x" }, { text: "y" }],
				expected: {
					role: "assistant",
					content: [
						{ type: "text", text: "x" },
						{ type: "text", text: "y" },
					],
				},
			},
			{
				label: "filters non-text then collapses single for user",
				role: "user",
				parts: [{ inlineData: { data: "z" } }, { text: "only" }],
				expected: { role: "user", content: "only" },
			},
			{
				label: "filters non-text then collapses single for system",
				role: "system",
				parts: [{ inlineData: { data: "z" } }, { text: "only" }],
				expected: { role: "system", content: "only" },
			},
			{
				label: "filters non-text then collapses single for assistant",
				role: "assistant",
				parts: [{ inlineData: { data: "z" } }, { text: "only" }],
				expected: { role: "assistant", content: "only" },
			},
			{
				label: "all non-text => null",
				role: "user",
				parts: [{ inlineData: { data: "z" } }],
				expected: null,
			},
		])("$label", ({ role, parts, expected }) => {
			expect((llm as any).contentToAiSdkMessage({ role, parts })).toEqual(
				expected,
			);
		});

		it("skips falsy functionCall entries while keeping text", () => {
			expect(
				(llm as any).contentToAiSdkMessage({
					role: "model",
					parts: [
						{ text: "calling" },
						{ functionCall: undefined },
						{ functionCall: { id: "c9", name: "go", args: {} } },
						{ text: "" },
					],
				}),
			).toEqual({
				role: "assistant",
				content: [
					{ type: "text", text: "calling" },
					{
						type: "tool-call",
						toolCallId: "c9",
						toolName: "go",
						input: {},
					},
				],
			});
		});
	});

	describe("convertToAiSdkMessages leftovers", () => {
		it.each([
			{
				label: "undefined contents",
				request: { contents: undefined },
				expected: [],
			},
			{
				label: "null contents",
				request: { contents: null },
				expected: [],
			},
			{
				label: "skips null conversions",
				request: new LlmRequest({
					contents: [
						{ role: "user", parts: [] },
						{ role: "user", parts: [{ text: "keep" }] },
						{ role: "user", parts: [{ inlineData: { data: "x" } }] },
					],
				}),
				expected: [{ role: "user", content: "keep" }],
			},
		])("$label", ({ request, expected }) => {
			expect((llm as any).convertToAiSdkMessages(request)).toEqual(expected);
		});
	});

	it("constructor uses modelId and falls back for string instances", () => {
		expect(new AiSdkLlm(makeModel("named")).model).toBe("named");
		expect(new AiSdkLlm("plain" as unknown as LanguageModel).model).toBe(
			"ai-sdk-model",
		);
		expect(AiSdkLlm.supportedModels()).toEqual([]);
	});
});
