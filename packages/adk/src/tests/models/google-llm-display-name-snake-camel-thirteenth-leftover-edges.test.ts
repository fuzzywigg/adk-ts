import { GoogleGenAI } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleLlm } from "../../models/google-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("@google/genai", () => ({
	GoogleGenAI: vi.fn(),
	FinishReason: {
		STOP: "STOP",
		MAX_TOKENS: "MAX_TOKENS",
		FINISH_REASON_UNSPECIFIED: "FINISH_REASON_UNSPECIFIED",
	},
}));

/**
 * Thirteenth leftover: removeDisplayNameIfPresent only reads camel displayName.
 * Snake display_name is left intact even when camel is nulled.
 */
describe("google-llm displayName snake vs camel thirteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.GOOGLE_API_KEY = "test-key";
		process.env.GOOGLE_GENAI_USE_VERTEXAI = "false";
		vi.clearAllMocks();
		(GoogleGenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				models: {
					generateContent: vi.fn(),
					generateContentStream: vi.fn(),
				},
			}),
		);
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("snake display_name is unchanged", () => {
		const llm = new GoogleLlm();
		const data = { mimeType: "image/png", display_name: "keep" };
		(llm as any).removeDisplayNameIfPresent(data);
		expect(data.display_name).toBe("keep");
	});

	it("camel displayName is nulled (twelfth control)", () => {
		const llm = new GoogleLlm();
		const data = { mimeType: "image/png", displayName: "drop" };
		(llm as any).removeDisplayNameIfPresent(data);
		expect(data.displayName).toBeNull();
	});

	it("both keys: camel nulled, snake kept", () => {
		const llm = new GoogleLlm();
		const data = {
			mimeType: "image/png",
			displayName: "drop",
			display_name: "keep",
		};
		(llm as any).removeDisplayNameIfPresent(data);
		expect(data.displayName).toBeNull();
		expect(data.display_name).toBe("keep");
	});

	it("preprocessRequest only walks camel inlineData/fileData", () => {
		const llm = new GoogleLlm();
		const inlineSnake = { display_name: "inline-snake" };
		const fileSnake = { display_name: "file-snake" };
		const inlineCamel = { displayName: "inline-camel" };
		const req = {
			config: {},
			contents: [
				{
					parts: [
						{ inline_data: inlineSnake, file_data: fileSnake },
						{ inlineData: inlineCamel },
					],
				},
			],
		};
		(llm as any).preprocessRequest(req);
		expect(inlineSnake.display_name).toBe("inline-snake");
		expect(fileSnake.display_name).toBe("file-snake");
		expect(inlineCamel.displayName).toBeNull();
	});
});
