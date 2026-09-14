import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Fourteenth leftover: `_excludeNonSerializableFromConfig` only maps when
 * `key === "functions" && Array.isArray(value)`. Non-array values under
 * `functions` are stored raw (eleventh leftover is key-case near-misses).
 */
describe("telemetry functions non-array raw-keep fourteenth leftover edges", () => {
	const service = new TelemetryService();

	it.each([
		{ label: "string", value: "not-an-array" },
		{ label: "empty string", value: "" },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "plain object", value: { name: "x" } },
	])("keeps non-array functions ($label) without mapping", ({ value }) => {
		const built = (service as any)._buildLlmRequestForTrace({
			model: "m",
			config: { functions: value },
			contents: [],
		} as LlmRequest);
		expect(built.config.functions).toEqual(value);
	});

	it("still maps real functions arrays (control)", () => {
		const built = (service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {
				functions: [{ name: "f", description: "d", handler: () => 1 }],
			},
			contents: [],
		} as LlmRequest);
		expect(built.config.functions).toEqual([
			{ name: "f", description: "d", parameters: undefined },
		]);
		expect(built.config.functions[0]).not.toHaveProperty("handler");
	});
});
