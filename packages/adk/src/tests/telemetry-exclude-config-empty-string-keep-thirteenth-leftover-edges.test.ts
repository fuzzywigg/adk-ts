import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Thirteenth leftover: _excludeNonSerializableFromConfig skips only
 * undefined/null (and response_schema key). Empty string / 0 / false / NaN
 * are kept. Tenth leftover is span || 0; eleventh is response_schema key case.
 */
describe("telemetry exclude-config empty-string keep thirteenth leftover edges", () => {
	const service = new TelemetryService();

	it('keeps 0 / false / "" / NaN and omits null/undefined', () => {
		const built = (service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {
				temperature: 0,
				topP: false,
				label: "",
				name: null,
				missing: undefined,
				nan: Number.NaN,
			},
			contents: [],
		} as LlmRequest);
		expect(built.config).toEqual({
			temperature: 0,
			topP: false,
			label: "",
			nan: Number.NaN,
		});
		expect(built.config).not.toHaveProperty("name");
		expect(built.config).not.toHaveProperty("missing");
	});

	it("strips snake response_schema but keeps camel responseSchema", () => {
		const built = (service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {
				response_schema: { type: "object" },
				responseSchema: { type: "string" },
			},
			contents: [],
		} as LlmRequest);
		expect(built.config.response_schema).toBeUndefined();
		expect(built.config.responseSchema).toEqual({ type: "string" });
	});
});
