import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * Object.entries — boxed-falsy → empty entries; `"-Infinity"` copies
 * char-index keys (twin of tip `"Infinity"`); `-1` → empty via ToObject.
 */
describe("telemetry config object-false/zero/empty nineteenth residual deepen", () => {
	const service = new TelemetryService();
	const build = (config: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config,
			contents: [],
		} as LlmRequest);

	it.each([
		{ label: "Object(false)", config: Object(false) },
		{ label: "Object(0)", config: Object(0) },
		{ label: 'Object("")', config: Object("") },
		{ label: "Object(NaN)", config: Object(Number.NaN) },
		{ label: "number -1", config: -1 },
	])("boxed/primitive residual $label → empty entries", ({ config }) => {
		expect(build(config).config).toEqual({});
	});

	it('string "-Infinity" copies char-index keys into built config', () => {
		expect(build("-Infinity").config).toEqual({
			"0": "-",
			"1": "I",
			"2": "n",
			"3": "f",
			"4": "i",
			"5": "n",
			"6": "i",
			"7": "t",
			"8": "y",
		});
	});
});
