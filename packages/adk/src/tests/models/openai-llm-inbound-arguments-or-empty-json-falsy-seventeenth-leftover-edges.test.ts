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
 * Seventeenth leftover: inbound `JSON.parse(arguments || "{}")` falsy matrix
 * beyond omit/`""` (matrix/sixth). Distinct from #219 outbound parameters `|| {}`.
 */
describe("openai-llm inbound arguments or-empty-json falsy seventeenth leftover edges", () => {
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
		{ label: "0", arguments: 0 },
		{ label: "false", arguments: false },
		{ label: "null", arguments: null },
		{ label: "undefined", arguments: undefined },
		{ label: "empty", arguments: "" },
	])("falsy arguments ($label) → {}", ({ arguments: args }) => {
		const resp = (llm as any).openAiMessageToLlmResponse({
			message: {
				role: "assistant",
				content: null,
				tool_calls: [
					{
						id: "c1",
						type: "function",
						function: { name: "fn", arguments: args },
					},
				],
			},
			finish_reason: "tool_calls",
			index: 0,
		});
		expect(resp.content.parts[0].functionCall.args).toEqual({});
	});

	it('truthy arguments "0" stays (JSON.parse("0") → 0)', () => {
		const resp = (llm as any).openAiMessageToLlmResponse({
			message: {
				role: "assistant",
				content: null,
				tool_calls: [
					{
						id: "c1",
						type: "function",
						function: { name: "fn", arguments: "0" },
					},
				],
			},
			finish_reason: "tool_calls",
			index: 0,
		});
		expect(resp.content.parts[0].functionCall.args).toBe(0);
	});

	it('createChunkResponse also coalesces falsy arguments via || "{}"', () => {
		const resp = (llm as any).createChunkResponse({
			tool_calls: [
				{
					index: 0,
					id: "c1",
					type: "function",
					function: { name: "fn", arguments: "" },
				},
			],
		});
		expect(resp.content.parts[0].functionCall.args).toEqual({});
	});
});
