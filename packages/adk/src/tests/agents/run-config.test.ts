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

	it("wires live audio and proactivity options", () => {
		const speechConfig = { languageCode: "en-US" } as any;
		const inputAudioTranscription = { languageCode: "en-US" } as any;
		const outputAudioTranscription = { languageCode: "en-GB" } as any;
		const realtimeInputConfig = { automaticActivityDetection: {} } as any;
		const proactivity = { proactiveAudio: true } as any;

		const config = new RunConfig({
			speechConfig,
			responseModalities: ["AUDIO", "TEXT"],
			inputAudioTranscription,
			outputAudioTranscription,
			realtimeInputConfig,
			enableAffectiveDialog: true,
			proactivity,
			streamingMode: StreamingMode.BIDI,
		});

		expect(config.speechConfig).toBe(speechConfig);
		expect(config.responseModalities).toEqual(["AUDIO", "TEXT"]);
		expect(config.inputAudioTranscription).toBe(inputAudioTranscription);
		expect(config.outputAudioTranscription).toBe(outputAudioTranscription);
		expect(config.realtimeInputConfig).toBe(realtimeInputConfig);
		expect(config.enableAffectiveDialog).toBe(true);
		expect(config.proactivity).toBe(proactivity);
		expect(config.streamingMode).toBe(StreamingMode.BIDI);
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

	it("warns for negative maxLlmCalls as well as zero", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		new RunConfig({ maxLlmCalls: -1 });
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][0]).toContain("less than or equal to 0");
	});

	it("exposes StreamingMode enum values", () => {
		expect(StreamingMode.NONE).toBe("NONE");
		expect(StreamingMode.SSE).toBe("sse");
		expect(StreamingMode.BIDI).toBe("bidi");
	});

	it("treats omitted boolean flags as false via || defaults", () => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: undefined,
			supportCFC: undefined,
			streamingMode: undefined,
			maxLlmCalls: undefined,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(false);
		expect(config.supportCFC).toBe(false);
		expect(config.streamingMode).toBe(StreamingMode.NONE);
		expect(config.maxLlmCalls).toBe(500);
	});
});
