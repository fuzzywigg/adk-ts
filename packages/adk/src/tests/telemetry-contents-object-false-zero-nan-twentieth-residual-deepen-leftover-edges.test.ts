import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Twentieth leftover residual deepen (complements #282 object-true/one/infinity):
 * `for (const content of llmRequest.contents || [])` — boxed falsy
 * `Object(false)` / `Object(0)` / `Object(NaN)` throw (non-iterable).
 */
describe("telemetry contents object-false/zero/nan twentieth residual deepen", () => {
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
	])("boxed non-iterable $label throws on for-of", ({ contents }) => {
		expect(() => build(contents)).toThrow();
	});
});
