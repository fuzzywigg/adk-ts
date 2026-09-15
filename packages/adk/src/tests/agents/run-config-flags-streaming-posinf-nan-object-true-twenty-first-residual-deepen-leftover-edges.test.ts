import { describe, expect, it } from "vitest";
import { RunConfig, StreamingMode } from "../../agents/run-config";

/**
 * Twenty-first leftover residual deepen (complements #251 true/negzero):
 * flags / streamingMode `||` — POSITIVE_INFINITY / `1` / `{}` / `Object(true)` /
 * `"Infinity"` kept; `NaN` coalesces to `false` / NONE.
 */
describe("RunConfig flags/streaming posinf/nan/object-true twenty-first residual deepen", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
		{ label: '"Infinity"', value: "Infinity" },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("$label flags/streamingMode are preserved via ||", ({ value }) => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: value as any,
			supportCFC: value as any,
			streamingMode: value as any,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(value);
		expect(config.supportCFC).toBe(value);
		expect(config.streamingMode).toBe(value);
		expect(config.streamingMode).not.toBe(StreamingMode.NONE);
	});

	it("NaN flags coalesce to false / NONE via ||", () => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: Number.NaN as any,
			supportCFC: Number.NaN as any,
			streamingMode: Number.NaN as any,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(false);
		expect(config.supportCFC).toBe(false);
		expect(config.streamingMode).toBe(StreamingMode.NONE);
	});
});
