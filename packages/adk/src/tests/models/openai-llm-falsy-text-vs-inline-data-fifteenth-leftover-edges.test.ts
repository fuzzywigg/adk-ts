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
		chat: { completions: { create: vi.fn() } },
	})),
}));

/**
 * Fifteenth leftover: `if (part.text)` then image branch — falsy text loses to
 * inline_data; truthy whitespace/"0" stay text and hide the image.
 */
describe("openai-llm falsy text vs inline-data fifteenth leftover edges", () => {
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
		{ label: "empty string", text: "" },
		{ label: "0", text: 0 },
		{ label: "false", text: false },
	])("falsy text ($label) falls through to inline_data image_url", ({
		text,
	}) => {
		const part = (llm as any).partToOpenAiContent({
			text,
			inline_data: { mime_type: "image/png", data: "abc" },
		});
		expect(part).toEqual({
			type: "image_url",
			image_url: { url: "data:image/png;base64,abc" },
		});
	});

	it.each([
		{ label: "whitespace", text: " " },
		{ label: "zero string", text: "0" },
	])("truthy text ($label) wins over inline_data", ({ text }) => {
		const part = (llm as any).partToOpenAiContent({
			text,
			inline_data: { mime_type: "image/png", data: "abc" },
		});
		expect(part).toEqual({ type: "text", text });
	});
});
