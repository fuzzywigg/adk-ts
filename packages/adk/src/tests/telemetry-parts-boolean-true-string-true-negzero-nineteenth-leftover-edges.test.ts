import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip #260 / #261; lands closed #252):
 * `content.parts?.filter(...) || []`. Sixteenth pinned 0 / false / "" throw
 * and nullish coalesce. Residual boolean `true` / string `"true"` / `-0` /
 * `-Infinity` still call `.filter` (optional chaining is nullish-only).
 */
describe("telemetry parts boolean-true/string-true/negzero nineteenth leftover edges", () => {
	const service = new TelemetryService();
	const build = (parts: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {},
			contents: [{ role: "user", parts }],
		} as LlmRequest);

	it.each([
		{ label: "boolean true", parts: true },
		{ label: "string true", parts: "true" },
		{ label: "-0", parts: -0 },
		{ label: "NEGATIVE_INFINITY", parts: Number.NEGATIVE_INFINITY },
		{ label: "empty object", parts: {} },
	])("truthy/near-miss non-array parts ($label) throws on .filter", ({
		parts,
	}) => {
		expect(() => build(parts)).toThrow();
	});

	it("empty array parts still stays [] via filter result || []", () => {
		expect(build([]).contents[0].parts).toEqual([]);
	});
});
