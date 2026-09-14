import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after #248):
 * `for (const content of llmRequest.contents || [])`. Seventeenth pinned
 * classic falsy + `"0"` / whitespace / `true` / `1` / `{}`. Residual
 * boolean-true sibling already throws; deepen string `"true"` char-iter,
 * SameValueZero `-0` coalesce, empty-array empty for-of, `-Infinity` throw.
 */
describe("telemetry contents string-true/negzero/infinity nineteenth leftover edges", () => {
	const service = new TelemetryService();
	const build = (contents: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {},
			contents,
		} as LlmRequest);

	it('string "true" iterates four code units into empty shells', () => {
		const result = build("true");
		expect(result.contents).toHaveLength(4);
		expect(result.contents.every((c: any) => c.role === undefined)).toBe(true);
		expect(result.contents.every((c: any) => Array.isArray(c.parts))).toBe(
			true,
		);
	});

	it("SameValueZero -0 contents still coalesce to []", () => {
		expect(build(-0).contents).toEqual([]);
		expect(Object.is(-0, -0)).toBe(true);
	});

	it("empty array contents yields zero shells (truthy but empty for-of)", () => {
		expect(build([]).contents).toEqual([]);
	});

	it.each([
		{ label: "NEGATIVE_INFINITY", contents: Number.NEGATIVE_INFINITY },
		{ label: "boolean true", contents: true },
	])("truthy non-iterable $label still throws on for-of", ({ contents }) => {
		expect(() => build(contents)).toThrow();
	});
});
