import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Nineteenth leftover residual deepen (complements #269 NaN/posinf contents):
 * `for (const content of llmRequest.contents || [])` —
 * `Object(true)` / `1` / `{}` throw (non-iterable); `"Infinity"` iterates
 * eight char shells (sibling of nineteenth `"true"` four-char iterate).
 */
describe("telemetry contents object-true/one/infinity nineteenth residual deepen", () => {
	const service = new TelemetryService();
	const build = (contents: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {},
			contents,
		} as LlmRequest);

	it.each([
		{ label: "Object(true)", contents: Object(true) },
		{ label: "number 1", contents: 1 },
		{ label: "empty object", contents: {} },
	])("truthy non-iterable $label throws on for-of", ({ contents }) => {
		expect(() => build(contents)).toThrow();
	});

	it('string "Infinity" iterates eight char shells', () => {
		const result = build("Infinity");
		expect(result.contents).toHaveLength(8);
		expect(result.contents.every((c: any) => c.role === undefined)).toBe(true);
		expect(result.contents.every((c: any) => Array.isArray(c.parts))).toBe(
			true,
		);
	});
});
