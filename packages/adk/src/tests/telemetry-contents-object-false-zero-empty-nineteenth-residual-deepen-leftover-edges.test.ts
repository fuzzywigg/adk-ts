import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `for (const content of llmRequest.contents || [])` —
 * boxed-falsy / `-1` throw (non-iterable); `"-Infinity"` iterates
 * nine char shells (twin of tip `"Infinity"` eight-char iterate).
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
		{ label: 'Object("")', contents: Object("") },
		{ label: "Object(NaN)", contents: Object(Number.NaN) },
		{ label: "number -1", contents: -1 },
	])("truthy non-iterable $label throws on for-of", ({ contents }) => {
		expect(() => build(contents)).toThrow();
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
