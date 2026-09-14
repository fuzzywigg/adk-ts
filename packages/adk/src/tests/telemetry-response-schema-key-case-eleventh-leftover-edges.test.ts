import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Eleventh leftover: _excludeNonSerializableFromConfig skips only exact
 * key === "response_schema". Near-miss keys are kept.
 */
describe("telemetry response_schema key case eleventh leftover", () => {
	const service = new TelemetryService();
	const exclude = (config: any) =>
		(service as any)._excludeNonSerializableFromConfig(config);
	const build = (config: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config,
			contents: [],
		} as LlmRequest);

	it.each([
		"Response_Schema",
		"responseSchema",
		"RESPONSE_SCHEMA",
		"response_schema ",
		" response_schema",
	])("near-miss key %j is preserved (only exact response_schema stripped)", (key) => {
		const result = exclude({
			[key]: { type: "object" },
			temperature: 0.2,
			response_schema: { type: "string" },
		});
		expect(result).toHaveProperty(key);
		expect(result[key]).toEqual({ type: "object" });
		expect(result).not.toHaveProperty("response_schema");
		expect(result.temperature).toBe(0.2);
	});

	it("build path strips exact response_schema but keeps camelCase near-miss", () => {
		const built = build({
			response_schema: { type: "object" },
			responseSchema: { type: "number" },
			topP: 0.9,
		});
		expect(built.config).not.toHaveProperty("response_schema");
		expect(built.config.responseSchema).toEqual({ type: "number" });
		expect(built.config.topP).toBe(0.9);
	});
});
