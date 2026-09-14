import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicLlm } from "../../models/anthropic-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("@anthropic-ai/sdk", () => ({
	default: vi.fn(),
}));

describe("AnthropicLlm toAnthropicRole case sensitivity fifth leftover", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let llm: AnthropicLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "fifth-anthropic";
		vi.clearAllMocks();
		(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				messages: { create: vi.fn() },
			}),
		);
		llm = new AnthropicLlm("claude-3-5-sonnet-20241022");
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it.each([
		{ label: "model", role: "model" },
		{ label: "assistant", role: "assistant" },
	])("$label maps to assistant", ({ role }) => {
		expect((llm as any).toAnthropicRole(role)).toBe("assistant");
	});

	it.each([
		{ label: "Model", role: "Model" },
		{ label: "MODEL", role: "MODEL" },
		{ label: "Assistant", role: "Assistant" },
		{ label: "ASSISTANT", role: "ASSISTANT" },
		{ label: "model ", role: "model " },
		{ label: " assistant", role: " assistant" },
		{ label: "user", role: "user" },
		{ label: "system", role: "system" },
		{ label: "empty-string", role: "" },
		{ label: "undefined", role: undefined },
	])("$label falls through to user (strict model|assistant only)", ({
		role,
	}) => {
		expect((llm as any).toAnthropicRole(role)).toBe("user");
	});
});
