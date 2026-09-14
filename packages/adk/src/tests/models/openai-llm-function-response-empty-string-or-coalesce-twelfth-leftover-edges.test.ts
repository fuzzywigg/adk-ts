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
 * Twelfth leftover: OpenAI `JSON.stringify(response || {})` collapses
 * `""` / 0 / false / null / undefined to `"{}"`. Contrast AI SDK eleventh
 * leftover where `""` stays a text output.
 */
describe("openai-llm function-response empty-string || coalesce twelfth leftover edges", () => {
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
		{ label: "empty string", response: "" },
		{ label: "null", response: null },
		{ label: "undefined", response: undefined },
		{ label: "0", response: 0 },
		{ label: "false", response: false },
	])("$label response coalesces to {}", ({ response }) => {
		expect(
			(llm as any).contentToOpenAiMessage({
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "fr-1",
							name: "tool",
							response,
						},
					},
				],
			}),
		).toEqual({
			role: "tool",
			tool_call_id: "fr-1",
			content: "{}",
		});
	});

	it("whitespace string is truthy and JSON-stringified as-is", () => {
		expect(
			(llm as any).contentToOpenAiMessage({
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "fr-2",
							name: "tool",
							response: " ",
						},
					},
				],
			}),
		).toEqual({
			role: "tool",
			tool_call_id: "fr-2",
			content: '" "',
		});
	});

	it("object response is stringified without coalesce (control)", () => {
		expect(
			(llm as any).contentToOpenAiMessage({
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "fr-3",
							name: "tool",
							response: { ok: true },
						},
					},
				],
			}),
		).toEqual({
			role: "tool",
			tool_call_id: "fr-3",
			content: '{"ok":true}',
		});
	});
});
