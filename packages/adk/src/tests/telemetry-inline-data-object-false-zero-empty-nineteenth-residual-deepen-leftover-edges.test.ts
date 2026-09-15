import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `!part.inlineData` — boxed-falsy / `"-Infinity"` / `-1` filtered
 * (truthy objects/strings/negone), unlike primitive falsy keep.
 */
describe("telemetry inlineData object-false/zero/empty nineteenth residual deepen", () => {
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
		{ label: 'Object("")', inlineData: Object("") },
		{ label: "Object(NaN)", inlineData: Object(Number.NaN) },
		{ label: 'string "-Infinity"', inlineData: "-Infinity" },
		{ label: "number -1", inlineData: -1 },
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
