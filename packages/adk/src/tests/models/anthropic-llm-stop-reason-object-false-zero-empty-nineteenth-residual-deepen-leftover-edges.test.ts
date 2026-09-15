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
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `["end_turn", ...].includes(anthropicStopReason || "")` — boxed-falsy /
 * `"-Infinity"` / `-1` bypass `|| ""` but miss allow-list → UNSPECIFIED.
 */
describe("anthropic-llm stop-reason object-false/zero/empty nineteenth residual deepen", () => {
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
		{ label: "Object(false)", reason: Object(false) as any },
		{ label: "Object(0)", reason: Object(0) as any },
		{ label: 'Object("")', reason: Object("") as any },
		{ label: "Object(NaN)", reason: Object(Number.NaN) as any },
		{ label: 'string "-Infinity"', reason: "-Infinity" as any },
		{ label: "number -1", reason: -1 as any },
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
