import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip 96457a9 / #248):
 * `Object.entries(config)` after eighteenth falsy-primitive / true / `[]` /
 * `-Infinity` / string char-index. `NaN`/`POSITIVE_INFINITY` → empty entries;
 * empty object `{}` keeps identity as empty built config.
 */
describe("telemetry config nan posinf empty-object nineteenth leftover edges", () => {
	const service = new TelemetryService();
	const build = (config: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config,
			contents: [],
		} as LlmRequest);

	it.each([
		{ label: "NaN", config: Number.NaN },
		{ label: "POSITIVE_INFINITY", config: Number.POSITIVE_INFINITY },
	])("non-object $label → empty entries", ({ config }) => {
		expect(build(config).config).toEqual({});
	});

	it("empty object {} stays empty built config (identity keys none)", () => {
		const empty = {};
		expect(build(empty).config).toEqual({});
		expect(Object.keys(build(empty).config)).toEqual([]);
	});

	it("non-empty object still copies serializable keys", () => {
		expect(build({ temperature: 0.2, maxOutputTokens: 8 }).config).toEqual({
			temperature: 0.2,
			maxOutputTokens: 8,
		});
	});
});
