import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicLlm } from "../../models/anthropic-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("@anthropic-ai/sdk", () => ({
	default: vi.fn(() => ({
		messages: { create: vi.fn() },
	})),
}));

/**
 * Nineteenth leftover (complement #252 after tip #251):
 * `["end_turn", ...].includes(anthropicStopReason || "")`. Untested residual:
 * boolean-true / `"true"` / `[]` / `-Infinity` bypass `|| ""` but miss the
 * allow-list → UNSPECIFIED; SameValueZero `-0` coalesces to `""` → UNSPECIFIED;
 * known `"end_turn"` still maps to STOP.
 */
describe("anthropic-llm stop-reason boolean-true/string-true/negzero nineteenth leftover edges", () => {
	let llm: AnthropicLlm;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "test-key";
		llm = new AnthropicLlm();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		{ label: "boolean true", reason: true as any },
		{ label: "string true", reason: "true" as any },
		{ label: "empty array", reason: [] as any },
		{
			label: "NEGATIVE_INFINITY",
			reason: Number.NEGATIVE_INFINITY as any,
		},
		{ label: "-0", reason: -0 as any },
	])("toAdkFinishReason residual $label → FINISH_REASON_UNSPECIFIED", ({
		reason,
	}) => {
		expect((llm as any).toAdkFinishReason(reason)).toBe(
			"FINISH_REASON_UNSPECIFIED",
		);
	});

	it("known end_turn still maps to STOP (control)", () => {
		expect((llm as any).toAdkFinishReason("end_turn")).toBe("STOP");
	});
});
