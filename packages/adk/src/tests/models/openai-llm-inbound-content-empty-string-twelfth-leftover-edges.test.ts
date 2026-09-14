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
		chat: {
			completions: {
				create: vi.fn(),
			},
		},
	})),
}));

/**
 * Twelfth leftover: inbound `if (message.content)` / `if (delta.content)`
 * skip empty string (no text part). Whitespace is kept.
 */
describe("openai-llm inbound content empty-string twelfth leftover edges", () => {
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

	it("openAiMessageToLlmResponse skips empty-string content", () => {
		const resp = (llm as any).openAiMessageToLlmResponse({
			message: { content: "", role: "assistant" },
			finish_reason: "stop",
		});
		expect(resp.content.parts).toEqual([]);
		expect(resp.finishReason).toBe("STOP");
	});

	it("openAiMessageToLlmResponse keeps whitespace content", () => {
		const resp = (llm as any).openAiMessageToLlmResponse({
			message: { content: " ", role: "assistant" },
			finish_reason: "stop",
		});
		expect(resp.content.parts).toEqual([{ text: " " }]);
	});

	it("createChunkResponse skips empty-string delta.content", () => {
		const resp = (llm as any).createChunkResponse({ content: "" });
		expect(resp.content).toBeUndefined();
	});

	it("createChunkResponse keeps whitespace delta.content", () => {
		const resp = (llm as any).createChunkResponse({ content: " " });
		expect(resp.content).toEqual({
			role: "model",
			parts: [{ text: " " }],
		});
	});

	it("empty-string content still attaches tool_calls on the message path", () => {
		const resp = (llm as any).openAiMessageToLlmResponse({
			message: {
				content: "",
				role: "assistant",
				tool_calls: [
					{
						id: "tc-1",
						type: "function",
						function: { name: "search", arguments: '{"q":1}' },
					},
				],
			},
			finish_reason: "tool_calls",
		});
		expect(resp.content.parts).toEqual([
			{
				functionCall: {
					id: "tc-1",
					name: "search",
					args: { q: 1 },
				},
			},
		]);
	});
});
