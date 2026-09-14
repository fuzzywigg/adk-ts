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
 * Fourteenth leftover: tools?.[0]?.functionDeclarations — decls only on
 * tools[1] are ignored. OpenAI thirteenth already pinned this gate.
 */
describe("anthropic-llm tools index-zero only fourteenth leftover edges", () => {
	let llm: AnthropicLlm;
	let originalEnv: NodeJS.ProcessEnv;
	let mockCreate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "test-key";
		mockCreate = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "ok" }],
			stop_reason: "end_turn",
			usage: { input_tokens: 1, output_tokens: 1 },
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

	async function drain(req: LlmRequest): Promise<void> {
		for await (const _ of (llm as any).generateContentAsyncImpl(req, false)) {
			/* drain */
		}
	}

	it("functionDeclarations only on tools[1] leave tools/tool_choice undefined", async () => {
		await drain(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: {
					tools: [
						{ googleSearch: {} },
						{
							functionDeclarations: [
								{ name: "hidden", description: "d", parameters: {} },
							],
						},
					],
				} as any,
			}),
		);

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				tools: undefined,
				tool_choice: undefined,
			}),
		);
	});

	it("functionDeclarations on tools[0] are mapped (control)", async () => {
		await drain(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
				config: {
					tools: [
						{
							functionDeclarations: [
								{ name: "visible", description: "d", parameters: {} },
							],
						},
					],
				} as any,
			}),
		);

		const params = mockCreate.mock.calls[0][0];
		expect(params.tool_choice).toEqual({ type: "auto" });
		expect(params.tools).toEqual([
			expect.objectContaining({ name: "visible" }),
		]);
	});
});
