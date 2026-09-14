import { describe, expect, it } from "vitest";
import { RunConfig, StreamingMode } from "../../agents/run-config";

/**
 * Seventh leftover: string `"0"` / `"false"` are truthy for
 * `saveInputBlobsAsArtifacts` / `supportCFC` / `streamingMode ||` defaults.
 * Fifth leftover only pins numeric `0` / boolean `false` / `""` coalesce;
 * sixth leftover covers maxLlmCalls `??` string `"0"`.
 */
describe("RunConfig flags/streaming string-zero/false seventh leftover", () => {
	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
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
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("$label streamingMode is preserved (not NONE)", ({ value }) => {
		const config = new RunConfig({ streamingMode: value as any });
		expect(config.streamingMode).toBe(value);
		expect(config.streamingMode).not.toBe(StreamingMode.NONE);
	});

	it("numeric 0 flags still coalesce to false (fifth control)", () => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: 0 as any,
			supportCFC: 0 as any,
			streamingMode: 0 as any,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(false);
		expect(config.supportCFC).toBe(false);
		expect(config.streamingMode).toBe(StreamingMode.NONE);
	});

	it("boolean false flags still coalesce via || (fifth control)", () => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: false,
			supportCFC: false,
			streamingMode: false as any,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(false);
		expect(config.supportCFC).toBe(false);
		expect(config.streamingMode).toBe(StreamingMode.NONE);
	});
});
