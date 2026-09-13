import { afterEach, describe, expect, it, vi } from "vitest";
import { RunConfig, StreamingMode } from "../../agents/run-config";

describe("RunConfig", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("applies defaults", () => {
		const config = new RunConfig();

		expect(config.saveInputBlobsAsArtifacts).toBe(false);
		expect(config.supportCFC).toBe(false);
		expect(config.streamingMode).toBe(StreamingMode.NONE);
		expect(config.maxLlmCalls).toBe(500);
	});

	it("accepts partial overrides", () => {
		const config = new RunConfig({
			streamingMode: StreamingMode.SSE,
			maxLlmCalls: 10,
			supportCFC: true,
			saveInputBlobsAsArtifacts: true,
		});

		expect(config.streamingMode).toBe(StreamingMode.SSE);
		expect(config.maxLlmCalls).toBe(10);
		expect(config.supportCFC).toBe(true);
		expect(config.saveInputBlobsAsArtifacts).toBe(true);
	});

	it("accepts BIDI streaming mode", () => {
		const config = new RunConfig({ streamingMode: StreamingMode.BIDI });
		expect(config.streamingMode).toBe(StreamingMode.BIDI);
	});

	it("throws when maxLlmCalls is Number.MAX_SAFE_INTEGER", () => {
		expect(
			() => new RunConfig({ maxLlmCalls: Number.MAX_SAFE_INTEGER }),
		).toThrow(/maxLlmCalls should be less than/);
	});

	it("warns when maxLlmCalls is unbounded", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		new RunConfig({ maxLlmCalls: 0 });

		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][0]).toContain("no enforcement");
	});
});
