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
		chat: {
			completions: {
				create: vi.fn(),
			},
		},
	})),
}));

/**
 * Thirteenth leftover: `if (systemContent)` skips empty-string systemInstruction
 * but unshifts whitespace / "0". Sixth leftover pinned system *role* parts[0].
 */
describe("openai-llm systemInstruction empty vs whitespace thirteenth leftover edges", () => {
	let llm: OpenAiLlm;
	let originalEnv: NodeJS.ProcessEnv;
	let mockCreate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		mockCreate = vi.fn().mockResolvedValue({
			choices: [
				{
					message: { role: "assistant", content: "ok" },
					finish_reason: "stop",
				},
			],
		});
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		}));
		llm = new OpenAiLlm("gpt-4o-mini");
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	async function drain(req: LlmRequest): Promise<void> {
		for await (const _ of (llm as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}
	}

	it("empty-string systemInstruction does not unshift a system message", async () => {
		await drain(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: { systemInstruction: "" },
			}),
		);
		const messages = mockCreate.mock.calls[0][0].messages;
		expect(messages[0]).toEqual({
			role: "user",
			content: "q",
		});
		expect(messages.some((m: { role: string }) => m.role === "system")).toBe(
			false,
		);
	});

	it('whitespace systemInstruction unshifts { role: system, content: " " }', async () => {
		await drain(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: { systemInstruction: " " },
			}),
		);
		expect(mockCreate.mock.calls[0][0].messages[0]).toEqual({
			role: "system",
			content: " ",
		});
	});

	it('string "0" systemInstruction is truthy and unshifted', async () => {
		await drain(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: { systemInstruction: "0" },
			}),
		);
		expect(mockCreate.mock.calls[0][0].messages[0]).toEqual({
			role: "system",
			content: "0",
		});
	});

	it("undefined systemInstruction omits system message (control)", async () => {
		await drain(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
		);
		expect(
			mockCreate.mock.calls[0][0].messages.some(
				(m: { role: string }) => m.role === "system",
			),
		).toBe(false);
	});
});
