import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicLlm } from "../../models/anthropic-llm";
import { LlmRequest } from "../../models/llm-request";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("@anthropic-ai/sdk", () => ({
	default: vi.fn(() => ({
		messages: {
			create: vi.fn(),
		},
	})),
}));

describe("AnthropicLlm leftover edges (TOKENMAXX post #124)", () => {
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

	it("maps nullish request contents to empty Anthropic messages", async () => {
		const request = new LlmRequest({
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
		});
		(request as any).contents = null;

		for await (const _ of (llm as any).generateContentAsyncImpl(
			request,
			false,
		)) {
			// drain
		}

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({ messages: [] }),
		);
	});

	it("contentToAnthropicMessage uses empty content array when parts are nullish", () => {
		const message = (llm as any).contentToAnthropicMessage({
			role: "user",
			parts: undefined,
		});
		expect(message).toEqual(
			expect.objectContaining({
				role: "user",
				content: [],
			}),
		);
	});
});
