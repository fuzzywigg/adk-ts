import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Sixteenth leftover: `content.parts?.filter(...) || []` — null/undefined
 * coalesce (already covered); falsy non-array 0 / false / "" throw because
 * optional chaining does not short-circuit non-nullish falsy values.
 */
describe("telemetry contents parts falsy or-empty array sixteenth leftover edges", () => {
	const service = new TelemetryService();
	const build = (contents: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {},
			contents,
		} as LlmRequest);

	it.each([
		{ label: "0", parts: 0 },
		{ label: "false", parts: false },
		{ label: "empty string", parts: "" },
	])("falsy non-array parts ($label) throws on .filter", ({ parts }) => {
		expect(() => build([{ role: "user", parts }])).toThrow();
	});

	it("truthy empty array stays [] via filter result || []", () => {
		expect(build([{ role: "user", parts: [] }]).contents[0].parts).toEqual([]);
	});

	it("nullish parts still coalesce to []", () => {
		expect(build([{ role: "user", parts: null }]).contents[0].parts).toEqual(
			[],
		);
		expect(
			build([{ role: "user", parts: undefined }]).contents[0].parts,
		).toEqual([]);
	});
});
