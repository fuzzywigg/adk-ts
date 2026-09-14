import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
 * Eleventh leftover: single-part `{ text: "" }` fails truthy text shortcut
 * and falls into multi-part map → partToOpenAiContent throws.
 */
describe("openai-llm single-empty-text multipart-trap eleventh leftover edges", () => {
	let llm: OpenAiLlm;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		llm = new OpenAiLlm("gpt-4o-mini");
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		"user",
		"model",
		"assistant",
	])("role %j single empty-string text throws Unsupported part type", (role) => {
		expect(() =>
			(llm as any).contentToOpenAiMessage({
				role,
				parts: [{ text: "" }],
			}),
		).toThrow(/Unsupported part type/);
	});

	it("whitespace-only single text takes shortcut (truthy)", () => {
		expect(
			(llm as any).contentToOpenAiMessage({
				role: "user",
				parts: [{ text: " " }],
			}),
		).toEqual({ role: "user", content: " " });
	});

	it('system role coalesces empty text via || "" without throw', () => {
		expect(
			(llm as any).contentToOpenAiMessage({
				role: "system",
				parts: [{ text: "" }],
			}),
		).toEqual({ role: "system", content: "" });
	});

	it("non-empty single text still uses shortcut (control)", () => {
		expect(
			(llm as any).contentToOpenAiMessage({
				role: "user",
				parts: [{ text: "hello" }],
			}),
		).toEqual({ role: "user", content: "hello" });
	});
});
