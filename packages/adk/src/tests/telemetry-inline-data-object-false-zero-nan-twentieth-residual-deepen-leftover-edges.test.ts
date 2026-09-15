import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Twentieth leftover residual deepen (complements #282 object-true/one/infinity):
 * `!part.inlineData` — boxed falsy `Object(false)` / `Object(0)` /
 * `Object(NaN)` are truthy so filtered.
 */
describe("telemetry inlineData object-false/zero/nan twentieth residual deepen", () => {
	const service = new TelemetryService();
	const build = (contents: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {},
			contents,
		} as LlmRequest);

	it.each([
		{ label: "Object(false)", inlineData: Object(false) },
		{ label: "Object(0)", inlineData: Object(0) },
		{ label: "Object(NaN)", inlineData: Object(Number.NaN) },
	])("boxed residual inlineData $label is filtered", ({ inlineData }) => {
		const built = build([
			{
				role: "user",
				parts: [{ text: "t", inlineData }, { text: "keep-always" }],
			},
		]);
		expect(built.contents[0].parts).toEqual([{ text: "keep-always" }]);
	});
});
