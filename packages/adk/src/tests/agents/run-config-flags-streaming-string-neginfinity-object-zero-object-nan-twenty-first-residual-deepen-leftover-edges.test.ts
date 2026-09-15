import { describe, expect, it } from "vitest";
import { RunConfig, StreamingMode } from "../../agents/run-config";

/**
 * Twenty-first leftover residual deepen (complements #292 string-inf/obj-one/obj-false):
 * flags / streamingMode `||` — string `"-Infinity"` / `Object(0)` / `Object(NaN)`
 * keep (boxed zero/NaN are truthy; not NONE / false).
 */
describe("RunConfig flags/streaming string-neginfinity/object-zero/object-nan twenty-first residual deepen", () => {
	it.each([
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("$label saveInputBlobsAsArtifacts / supportCFC are preserved", ({
		value,
	}) => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: value as any,
			supportCFC: value as any,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(value);
		expect(config.supportCFC).toBe(value);
	});

	it.each([
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("$label streamingMode is preserved (not NONE)", ({ value }) => {
		const config = new RunConfig({ streamingMode: value as any });
		expect(config.streamingMode).toBe(value);
		expect(config.streamingMode).not.toBe(StreamingMode.NONE);
	});
});
