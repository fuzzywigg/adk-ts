import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiLlm } from "../../models/openai-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("openai", () => ({
	default: vi.fn(() => ({
		chat: { completions: { create: vi.fn() } },
	})),
}));

/**
 * Fifteenth leftover: inbound `if (message.content)` / `if (delta.content)`.
 * Twelfth leftover pinned "" vs " "; residual 0/false/null vs "0"/"false".
 */
describe("openai-llm inbound content falsy matrix fifteenth leftover edges", () => {
	let llm: OpenAiLlm;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		llm = new OpenAiLlm("gpt-4o-mini");
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		{ label: "0", content: 0 },
		{ label: "false", content: false },
		{ label: "null", content: null },
		{ label: "empty", content: "" },
	])("non-stream skips falsy content ($label)", ({ content }) => {
		const resp = (llm as any).openAiMessageToLlmResponse(
			{
				message: { role: "assistant", content, tool_calls: undefined },
				finish_reason: "stop",
			},
			undefined,
		);
		expect(resp.content.parts).toEqual([]);
	});

	it.each([
		{ label: "zero string", content: "0" },
		{ label: "false string", content: "false" },
		{ label: "whitespace", content: " " },
	])("non-stream keeps truthy content ($label)", ({ content }) => {
		const resp = (llm as any).openAiMessageToLlmResponse(
			{
				message: { role: "assistant", content, tool_calls: undefined },
				finish_reason: "stop",
			},
			undefined,
		);
		expect(resp.content.parts).toEqual([{ text: content }]);
	});

	it.each([
		{ label: "0", content: 0 },
		{ label: "false", content: false },
		{ label: "null", content: null },
		{ label: "empty", content: "" },
	])("stream chunk skips falsy delta.content ($label)", ({ content }) => {
		const resp = (llm as any).createChunkResponse(
			{ content, tool_calls: undefined },
			undefined,
		);
		expect(resp.content).toBeUndefined();
	});

	it.each([
		{ label: "zero string", content: "0" },
		{ label: "false string", content: "false" },
	])("stream chunk keeps truthy delta.content ($label)", ({ content }) => {
		const resp = (llm as any).createChunkResponse(
			{ content, tool_calls: undefined },
			undefined,
		);
		expect(resp.content.parts).toEqual([{ text: content }]);
	});
});
