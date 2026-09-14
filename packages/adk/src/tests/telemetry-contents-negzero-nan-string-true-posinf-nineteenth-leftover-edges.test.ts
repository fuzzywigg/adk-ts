import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip 96457a9 / #248):
 * `for (const content of llmRequest.contents || [])` after seventeenth
 * falsy/`"0"`/`{}`/`true`/`1`. `-0`/`NaN` coalesce; `"true"`/`[]` iterate;
 * `±Infinity` throw.
 */
describe("telemetry contents negzero nan string-true posinf nineteenth leftover edges", () => {
	const service = new TelemetryService();
	const build = (contents: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {},
			contents,
		} as LlmRequest);

	it.each([
		{ label: "-0", contents: -0 },
		{ label: "NaN", contents: Number.NaN },
	])("falsy near-miss contents ($label) coalesce to []", ({ contents }) => {
		expect(build(contents).contents).toEqual([]);
	});

	it('truthy string "true" iterates four char shells', () => {
		const result = build("true");
		expect(result.contents).toHaveLength(4);
		expect(result.contents.every((c: any) => c.role === undefined)).toBe(true);
		expect(result.contents.every((c: any) => Array.isArray(c.parts))).toBe(
			true,
		);
	});

	it("empty array contents is iterable and yields no shells", () => {
		expect(build([]).contents).toEqual([]);
	});

	it.each([
		{ label: "POSITIVE_INFINITY", contents: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", contents: Number.NEGATIVE_INFINITY },
	])("truthy non-iterable $label throws on for-of", ({ contents }) => {
		expect(() => build(contents)).toThrow();
	});
});
