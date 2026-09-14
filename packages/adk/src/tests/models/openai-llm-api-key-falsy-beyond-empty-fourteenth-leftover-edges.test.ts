import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../models/llm-request";
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
 * Fourteenth leftover: `if (!apiKey)` — fifth leftover only pins "" / undefined.
 * process.env coerces non-strings, so pin truthy near-miss strings " " / "0"
 * that still construct (contrast empty-string throw already covered).
 */
describe("openai-llm api-key falsy beyond empty fourteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: { completions: { create: vi.fn() } },
		}));
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it("empty-string OPENAI_API_KEY still throws (fifth control)", async () => {
		process.env.OPENAI_API_KEY = "";
		const llm = new OpenAiLlm("gpt-4o-mini");
		await expect(async () => {
			for await (const _ of (llm as any).generateContentAsyncImpl(
				new LlmRequest({
					contents: [{ role: "user", parts: [{ text: "q" }] }],
				}),
				false,
			)) {
				/* drain */
			}
		}).rejects.toThrow(/OPENAI_API_KEY/);
		expect(OpenAI).not.toHaveBeenCalled();
	});

	it.each([
		{ label: "whitespace", key: " " },
		{ label: "zero string", key: "0" },
		{ label: "false string", key: "false" },
	])("client constructs when OPENAI_API_KEY is truthy $label", async ({
		key,
	}) => {
		process.env.OPENAI_API_KEY = key;
		const create = vi.fn().mockResolvedValue({
			choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
		});
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: { completions: { create } },
		}));
		const llm = new OpenAiLlm("gpt-4o-mini");
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			false,
		)) {
			/* drain */
		}
		expect(OpenAI).toHaveBeenCalledWith({ apiKey: key });
		expect(create).toHaveBeenCalled();
	});
});
