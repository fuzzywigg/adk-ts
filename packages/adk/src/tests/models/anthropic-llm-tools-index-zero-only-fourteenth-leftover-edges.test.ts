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
 * Fourteenth leftover: Anthropic only reads `tools?.[0]?.functionDeclarations`.
 * OpenAI thirteenth leftover pinned the same trap; Anthropic tools[1] remains.
 */
describe("anthropic-llm tools index-zero only fourteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let mockCreate: ReturnType<typeof vi.fn>;
	let llm: AnthropicLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "test-key";
		mockCreate = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			usage: { input_tokens: 1, output_tokens: 1 },
			stop_reason: "end_turn",
		});
		(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				messages: { create: mockCreate },
			}),
		);
		llm = new AnthropicLlm();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it("functionDeclarations only on tools[1] are ignored", async () => {
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: {
					tools: [
						{ googleSearch: {} } as any,
						{
							functionDeclarations: [
								{ name: "hidden", description: "d", parameters: {} },
							],
						} as any,
					],
				},
			}),
			false,
		)) {
			/* drain */
		}
		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: undefined,
				tool_choice: undefined,
			}),
		);
	});

	it("functionDeclarations on tools[0] are mapped (control)", async () => {
		for await (const _ of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: {
					tools: [
						{
							functionDeclarations: [
								{ name: "visible", description: "d", parameters: {} },
							],
						} as any,
						{
							functionDeclarations: [
								{ name: "hidden", description: "d", parameters: {} },
							],
						} as any,
					],
				},
			}),
			false,
		)) {
			/* drain */
		}
		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: [
					expect.objectContaining({
						name: "visible",
					}),
				],
				tool_choice: { type: "auto" },
			}),
		);
	});
});
