import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Leftover: functions array .map strips handlers but preserves sparse/missing fields;
 * non-array functions falls through to else and is stored raw.
 */
describe("telemetry functions sparse-map leftover edges", () => {
	const service = new TelemetryService();
	const exclude = (config: any) =>
		(service as any)._excludeNonSerializableFromConfig(config);
	const build = (config: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config,
			contents: [],
		} as LlmRequest);

	it("maps sparse function entries with undefined fields", () => {
		const result = exclude({
			functions: [
				{},
				{ name: "only-name" },
				{ description: "only-desc" },
				{ parameters: { type: "object" } },
				{
					name: "full",
					description: "d",
					parameters: { type: "object" },
					handler: () => 1,
				},
			],
		});
		expect(result.functions).toEqual([
			{ name: undefined, description: undefined, parameters: undefined },
			{ name: "only-name", description: undefined, parameters: undefined },
			{ name: undefined, description: "only-desc", parameters: undefined },
			{
				name: undefined,
				description: undefined,
				parameters: { type: "object" },
			},
			{ name: "full", description: "d", parameters: { type: "object" } },
		]);
		expect(result.functions[4]).not.toHaveProperty("handler");
	});

	it("preserves empty functions array", () => {
		expect(exclude({ functions: [] })).toEqual({ functions: [] });
	});

	it.each([
		{ label: "string", value: "not-array" },
		{ label: "object", value: { name: "x" } },
		{ label: "number", value: 3 },
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "empty string", value: "" },
		{ label: "0", value: 0 },
	])("non-array functions ($label) is not remapped", ({ label, value }) => {
		if (value === null) {
			expect(exclude({ functions: null, temperature: 0.1 })).toEqual({
				temperature: 0.1,
			});
			return;
		}
		const result = exclude({ functions: value, temperature: 0.2 });
		expect(result.functions).toEqual(value);
		expect(result.temperature).toBe(0.2);
		void label;
	});

	it("build path still maps sparse functions through _buildLlmRequestForTrace", () => {
		const built = build({
			functions: [{ name: "a", handler: () => {} }, {}],
			response_schema: { type: "string" },
			temperature: undefined,
		});
		expect(built.config).toEqual({
			functions: [
				{ name: "a", description: undefined, parameters: undefined },
				{ name: undefined, description: undefined, parameters: undefined },
			],
		});
		expect(built.config).not.toHaveProperty("response_schema");
	});

	it("array-like non-array functions object is stored raw (Array.isArray false)", () => {
		const arrayLike = { 0: { name: "a", handler: () => 1 }, length: 1 };
		const result = exclude({ functions: arrayLike });
		expect(result.functions).toBe(arrayLike);
		expect(result.functions[0]).toHaveProperty("handler");
	});
});
