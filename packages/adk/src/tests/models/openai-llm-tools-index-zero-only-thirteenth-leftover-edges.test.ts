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
 * Thirteenth leftover: tools?.[0]?.functionDeclarations — decls only on
 * tools[1] are ignored. Fifth leftover pinned empty FDs on index 0.
 */
describe("openai-llm tools index-zero only thirteenth leftover edges", () => {
	let llm: OpenAiLlm;
	let originalEnv: NodeJS.ProcessEnv;
	let mockCreate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		mockCreate = vi.fn();
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

	it("functionDeclarations only on tools[1] leave tools/tool_choice undefined", async () => {
		mockCreate.mockResolvedValue({
			choices: [
				{
					message: { role: "assistant", content: "ok" },
					finish_reason: "stop",
				},
			],
		});

		await drain(
			new LlmRequest({
				model: "gpt-4o",
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

	it("functionDeclarations on tools[0] are used (control)", async () => {
		mockCreate.mockResolvedValue({
			choices: [
				{
					message: { role: "assistant", content: "ok" },
					finish_reason: "stop",
				},
			],
		});

		await drain(
			new LlmRequest({
				model: "gpt-4o",
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
		expect(params.tool_choice).toBe("auto");
		expect(params.tools).toEqual([
			expect.objectContaining({
				type: "function",
				function: expect.objectContaining({ name: "visible" }),
			}),
		]);
	});
});
