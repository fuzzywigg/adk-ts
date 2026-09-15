import { describe, expect, it } from "vitest";
import { RunConfig, StreamingMode } from "../../agents/run-config";

/**
 * Twenty-second leftover (HEAVY tip-relaunch residual after tip #258–#261):
 * twenty-first pins flags/streaming true/`"true"`/`[]`/`-0`. Assert
 * ±Infinity keep via `|| false` / `|| NONE` — residual sentinel deepen.
 */
describe("RunConfig flags/streaming infinity twenty-second leftover", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("$label saveInputBlobsAsArtifacts / supportCFC / streamingMode kept", ({
		value,
	}) => {
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

	it("SameValueZero -0 still coalesces (twenty-first control)", () => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: -0 as any,
			supportCFC: -0 as any,
			streamingMode: -0 as any,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(false);
		expect(config.supportCFC).toBe(false);
		expect(config.streamingMode).toBe(StreamingMode.NONE);
	});
});
