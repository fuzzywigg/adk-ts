import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `for (const content of llmRequest.contents || [])` —
 * boxed Number/Boolean/NaN / `-1` throw (non-iterable); `Object("")`
 * string-iterates to empty; `"-Infinity"` iterates nine char shells.
 */
describe("telemetry contents object-false/zero/empty nineteenth residual deepen", () => {
	const service = new TelemetryService();
	const build = (contents: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {},
			contents,
		} as LlmRequest);

	it.each([
		{ label: "Object(false)", contents: Object(false) },
		{ label: "Object(0)", contents: Object(0) },
		{ label: "Object(NaN)", contents: Object(Number.NaN) },
		{ label: "number -1", contents: -1 },
	])("truthy non-iterable $label throws on for-of", ({ contents }) => {
		expect(() => build(contents)).toThrow();
	});

	it('Object("") is string-iterable → zero char shells (empty)', () => {
		const result = build(Object(""));
		expect(result.contents).toEqual([]);
	});

	it('string "-Infinity" iterates nine char shells', () => {
		const result = build("-Infinity");
		expect(result.contents).toHaveLength(9);
		expect(result.contents.every((c: any) => c.role === undefined)).toBe(true);
		expect(result.contents.every((c: any) => Array.isArray(c.parts))).toBe(
			true,
		);
	});
});
