import { describe, expect, it } from "vitest";
import { RunConfig, StreamingMode } from "../../agents/run-config";

/**
 * Twenty-second leftover (HEAVY residual complement after open #265):
 * twenty-first pins true/`"true"`/`-0`/`[]`; #265 pins ±Infinity. Assert
 * number `1` / `{}` keep via `||`; `NaN` coalesces to false / NONE.
 */
describe("RunConfig flags/streaming number-one/empty-object/NaN twenty-second leftover", () => {
	it.each([
		{ label: "number 1", value: 1 },
		{ label: "empty-object", value: {} },
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
		{ label: "number 1", value: 1 },
		{ label: "empty-object", value: {} },
	])("$label streamingMode is preserved (not NONE)", ({ value }) => {
		const config = new RunConfig({ streamingMode: value as any });
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
