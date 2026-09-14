import { describe, expect, it } from "vitest";
import { RunConfig, StreamingMode } from "../../agents/run-config";

/**
 * Twenty-first leftover: seventh pins `"0"`/`"false"` keep for flags /
 * streamingMode; fifth pins boolean `true`. Assert `"true"` keeps; SameValueZero
 * `-0` coalesces to `false` / NONE — residual true asymmetry after twentieth
 * maxLlmCalls slice.
 */
describe("RunConfig flags/streaming true/string-true/negzero twenty-first leftover", () => {
	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
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
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("$label streamingMode is preserved (not NONE)", ({ value }) => {
		const config = new RunConfig({ streamingMode: value as any });
		expect(config.streamingMode).toBe(value);
		expect(config.streamingMode).not.toBe(StreamingMode.NONE);
	});

	it("SameValueZero -0 flags coalesce to false via ||", () => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: -0 as any,
			supportCFC: -0 as any,
			streamingMode: -0 as any,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(false);
		expect(config.supportCFC).toBe(false);
		expect(config.streamingMode).toBe(StreamingMode.NONE);
	});

	it("empty-array flags are truthy and preserved via ||", () => {
		const empty: never[] = [];
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: empty as any,
			supportCFC: empty as any,
			streamingMode: empty as any,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(empty as any);
		expect(config.supportCFC).toBe(empty as any);
		expect(config.streamingMode).toBe(empty as any);
	});

	it('string "false" still preserved (seventh control asymmetry)', () => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: "false" as any,
			supportCFC: "false" as any,
			streamingMode: "false" as any,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe("false");
		expect(config.supportCFC).toBe("false");
		expect(config.streamingMode).toBe("false");
	});
});
