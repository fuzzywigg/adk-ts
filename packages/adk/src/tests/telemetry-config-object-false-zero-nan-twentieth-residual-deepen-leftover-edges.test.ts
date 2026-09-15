import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Twentieth leftover residual deepen (complements #282 object-true/one/infinity):
 * config `Object.entries` — boxed falsy `Object(false)` / `Object(0)` /
 * `Object(NaN)` → empty entries (sibling of Object(true)/Object(1)).
 */
describe("telemetry config object-false/zero/nan twentieth residual deepen", () => {
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
		{ label: "Object(NaN)", config: Object(Number.NaN) },
	])("boxed non-object $label → empty entries", ({ config }) => {
		expect(build(config).config).toEqual({});
	});
});
