import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Nineteenth leftover residual deepen (complements #269 config Object.entries):
 * `Object(true)` / boxed `1` → empty entries; `"Infinity"` copies char-index
 * keys (sibling of eighteenth string char-index); `{}` stays empty.
 */
describe("telemetry config object-true/one/infinity nineteenth residual deepen", () => {
	const service = new TelemetryService();
	const build = (config: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config,
			contents: [],
		} as LlmRequest);

	it.each([
		{ label: "Object(true)", config: Object(true) },
		{ label: "Object(1)", config: Object(1) },
	])("boxed non-object $label → empty entries", ({ config }) => {
		expect(build(config).config).toEqual({});
	});

	it('string "Infinity" copies char-index keys into built config', () => {
		expect(build("Infinity").config).toEqual({
			"0": "I",
			"1": "n",
			"2": "f",
			"3": "i",
			"4": "n",
			"5": "i",
			"6": "t",
			"7": "y",
		});
	});

	it("empty object {} stays empty built config", () => {
		expect(build({}).config).toEqual({});
	});
});
