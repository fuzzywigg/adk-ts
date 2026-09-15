import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiSdkLlm } from "../../models/ai-sdk";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("ai", () => ({
	generateText: vi.fn(),
	streamText: vi.fn(),
	jsonSchema: vi.fn((schema: unknown) => ({ schema })),
}));

/**
 * Twentieth leftover residual deepen (complements #282 object-true/one/infinity):
 * `part.functionResponse.name || "unknown"` — boxed falsy `Object(false)` /
 * `Object(0)` / `Object(NaN)` keep (primitive NaN would collapse).
 */
describe("ai-sdk function-response name object-false/zero/nan twentieth residual deepen", () => {
	let aiSdk: AiSdkLlm;

	beforeEach(() => {
		aiSdk = new AiSdkLlm({
			modelId: "mock",
			provider: "mock",
			specificationVersion: "v2",
		} as unknown as LanguageModel);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: "Object(false)", name: Object(false) },
		{ label: "Object(0)", name: Object(0) },
		{ label: "Object(NaN)", name: Object(Number.NaN) },
	])("boxed residual functionResponse name kept ($label)", ({ name }) => {
		const msg = (aiSdk as any).contentToAiSdkMessage({
			role: "user",
			parts: [
				{
					functionResponse: {
						id: "r1",
						name: name as any,
						response: { ok: true },
					},
				},
			],
		});
		expect(msg.content[0].toolName).toBe(name);
	});
});
