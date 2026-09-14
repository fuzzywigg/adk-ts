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
 * Twelfth leftover: preprocessPart deletes inline_data when mime_type or
 * data is falsy (`""` / 0 / false). Whitespace is truthy and kept.
 */
describe("openai-llm preprocess empty-string mime/data twelfth leftover edges", () => {
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
		{ label: "empty mime_type", mime_type: "", data: "abc" },
		{ label: "empty data", mime_type: "image/png", data: "" },
		{ label: "both empty", mime_type: "", data: "" },
		{ label: "false mime_type", mime_type: false, data: "abc" },
		{ label: "0 data", mime_type: "image/png", data: 0 },
	])("$label deletes inline_data", ({ mime_type, data }) => {
		const part = { inline_data: { mime_type, data } };
		(llm as any).preprocessPart(part);
		expect(part.inline_data).toBeUndefined();
	});

	it("whitespace mime_type and data are kept (truthy)", () => {
		const part = { inline_data: { mime_type: " ", data: " " } };
		(llm as any).preprocessPart(part);
		expect(part.inline_data).toEqual({ mime_type: " ", data: " " });
	});

	it("valid mime_type and data are kept (control)", () => {
		const part = {
			inline_data: { mime_type: "image/png", data: "abc" },
		};
		(llm as any).preprocessPart(part);
		expect(part.inline_data).toEqual({
			mime_type: "image/png",
			data: "abc",
		});
	});

	it("missing inline_data is a no-op", () => {
		const part = { text: "hi" };
		(llm as any).preprocessPart(part);
		expect(part).toEqual({ text: "hi" });
	});
});
