import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicLlm } from "../../models/anthropic-llm";
import { LlmRequest } from "../../models/llm-request";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("@anthropic-ai/sdk");

/**
 * Fourteenth leftover: `if (!apiKey)` — leftover only deletes the env var.
 * Empty string also throws; whitespace / "0" are truthy and construct.
 * (process.env coerces non-strings, so numeric 0 cannot be stored as falsy.)
 */
describe("anthropic-llm api-key empty-string falsy fourteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				messages: { create: vi.fn() },
			}),
		);
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		{ label: "empty string", key: "" },
		{ label: "undefined via delete", key: undefined },
	])("client throws when ANTHROPIC_API_KEY is $label", async ({ key }) => {
		if (key === undefined) {
			delete process.env.ANTHROPIC_API_KEY;
		} else {
			process.env.ANTHROPIC_API_KEY = key;
		}
		const llm = new AnthropicLlm();
		await expect(async () => {
			for await (const _ of (llm as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "q" }] }],
				}),
				false,
			)) {
				/* drain */
			}
		}).rejects.toThrow(/ANTHROPIC_API_KEY/);
		expect(Anthropic).not.toHaveBeenCalled();
	});

	it.each([
		{ label: "whitespace", key: " " },
		{ label: "zero string", key: "0" },
	])("client constructs when ANTHROPIC_API_KEY is truthy $label", async ({
		key,
	}) => {
		process.env.ANTHROPIC_API_KEY = key;
		const create = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			usage: { input_tokens: 1, output_tokens: 1 },
			stop_reason: "end_turn",
		});
		(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				messages: { create },
			}),
		);
		const llm = new AnthropicLlm();
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			false,
		)) {
			/* drain */
		}
		expect(Anthropic).toHaveBeenCalledWith({ apiKey: key });
		expect(create).toHaveBeenCalled();
	});
});
