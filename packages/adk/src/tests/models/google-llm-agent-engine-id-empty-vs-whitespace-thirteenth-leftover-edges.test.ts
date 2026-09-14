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
 * Thirteenth leftover: trackingHeaders `if (process.env.GOOGLE_CLOUD_AGENT_ENGINE_ID)`
 * — empty string is falsy (no tag); whitespace / "0" are truthy and append the tag.
 * Sixth leftover only pinned memoization across later mutation.
 */
describe("google-llm agent-engine-id empty vs whitespace thirteenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.GOOGLE_API_KEY = "matrix-key";
		delete process.env.GOOGLE_CLOUD_AGENT_ENGINE_ID;
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

	it.each([
		{ label: "unset", value: undefined },
		{ label: "empty string", value: "" },
	])("$label omits +remote_reasoning_engine", ({ value }) => {
		if (value === undefined) {
			delete process.env.GOOGLE_CLOUD_AGENT_ENGINE_ID;
		} else {
			process.env.GOOGLE_CLOUD_AGENT_ENGINE_ID = value;
		}
		const headers = new GoogleLlm().trackingHeaders;
		expect(headers["x-goog-api-client"]).not.toMatch(
			/\+remote_reasoning_engine/,
		);
	});

	it.each([
		" ",
		"\t",
		"0",
		"engine-1",
	])("truthy %j appends +remote_reasoning_engine", (value) => {
		process.env.GOOGLE_CLOUD_AGENT_ENGINE_ID = value;
		const headers = new GoogleLlm().trackingHeaders;
		expect(headers["x-goog-api-client"]).toMatch(/\+remote_reasoning_engine/);
		expect(headers["user-agent"]).toMatch(/\+remote_reasoning_engine/);
	});
});
