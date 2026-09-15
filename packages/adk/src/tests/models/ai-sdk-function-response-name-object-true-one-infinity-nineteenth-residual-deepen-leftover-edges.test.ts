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
 * Nineteenth leftover residual deepen (complements #269 / AI SDK name ||):
 * `part.functionResponse.name || "unknown"` — `Object(true)` / `1` /
 * `"Infinity"` / `{}` keep (NaN would collapse).
 */
describe("ai-sdk function-response name object-true/one/infinity nineteenth residual deepen", () => {
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
		{ label: "Object(true)", name: Object(true) },
		{ label: "number 1", name: 1 },
		{ label: 'string "Infinity"', name: "Infinity" },
		{ label: "empty object", name: {} },
	])("truthy residual functionResponse name kept ($label)", ({ name }) => {
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

	it("NaN still collapses to unknown (nineteenth control)", () => {
		const msg = (aiSdk as any).contentToAiSdkMessage({
			role: "user",
			parts: [
				{
					functionResponse: {
						id: "r1",
						name: Number.NaN as any,
						response: { ok: true },
					},
				},
			],
		});
		expect(msg.content[0].toolName).toBe("unknown");
	});
});
