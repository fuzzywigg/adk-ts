import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Nineteenth leftover residual deepen (complements #269 NaN/posinf filter):
 * `!part.inlineData` — `Object(true)` / `1` / `"Infinity"` / `{}` filtered.
 */
describe("telemetry inlineData object-true/one/infinity nineteenth residual deepen", () => {
	const service = new TelemetryService();
	const build = (contents: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {},
			contents,
		} as LlmRequest);

	it.each([
		{ label: "Object(true)", inlineData: Object(true) },
		{ label: "number 1", inlineData: 1 },
		{ label: 'string "Infinity"', inlineData: "Infinity" },
		{ label: "empty object", inlineData: {} },
	])("truthy residual inlineData $label is filtered", ({ inlineData }) => {
		const built = build([
			{
				role: "user",
				parts: [{ text: "t", inlineData }, { text: "keep-always" }],
			},
		]);
		expect(built.contents[0].parts).toEqual([{ text: "keep-always" }]);
	});
});
