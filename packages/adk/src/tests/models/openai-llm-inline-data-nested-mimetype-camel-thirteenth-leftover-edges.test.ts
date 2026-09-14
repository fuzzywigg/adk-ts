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
 * Thirteenth leftover: preprocessPart gates on snake mime_type/data only.
 * Nested camel mimeType/data do not satisfy the keep condition.
 */
describe("openai-llm inline_data nested mimeType camel thirteenth leftover edges", () => {
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

	it("camel mimeType+data on snake inline_data is deleted (mime_type undefined)", () => {
		const part = {
			inline_data: { mimeType: "image/png", data: "abc" },
		};
		(llm as any).preprocessPart(part);
		expect(part.inline_data).toBeUndefined();
	});

	it("snake mime_type+data are kept (twelfth control)", () => {
		const part = {
			inline_data: { mime_type: "image/png", data: "abc" },
		};
		(llm as any).preprocessPart(part);
		expect(part.inline_data).toEqual({
			mime_type: "image/png",
			data: "abc",
		});
	});

	it("camel data missing but snake data present is kept", () => {
		const part = {
			inline_data: { mime_type: "image/png", data: "abc", mimeType: "ignored" },
		};
		(llm as any).preprocessPart(part);
		expect(part.inline_data.data).toBe("abc");
	});

	it("camel-only nested keys with empty snake fields delete", () => {
		const part = {
			inline_data: {
				mimeType: "image/png",
				data: "abc",
				mime_type: "",
			},
		};
		(llm as any).preprocessPart(part);
		expect(part.inline_data).toBeUndefined();
	});
});
