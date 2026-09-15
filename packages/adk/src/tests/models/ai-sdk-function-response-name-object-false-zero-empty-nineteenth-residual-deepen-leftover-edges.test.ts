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
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `part.functionResponse.name || "unknown"` — boxed-falsy / `"-Infinity"` /
 * `-1` keep (primitive NaN would collapse).
 */
describe("ai-sdk function-response name object-false/zero/empty nineteenth residual deepen", () => {
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
		{ label: 'Object("")', name: Object("") },
		{ label: "Object(NaN)", name: Object(Number.NaN) },
		{ label: 'string "-Infinity"', name: "-Infinity" },
		{ label: "number -1", name: -1 },
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

	it("primitive NaN still collapses to unknown (control)", () => {
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
