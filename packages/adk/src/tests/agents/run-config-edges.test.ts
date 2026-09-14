import { afterEach, describe, expect, it, vi } from "vitest";
import { RunConfig, StreamingMode } from "../../agents/run-config";

describe("RunConfig leftover edges", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("applies || false defaults for saveInputBlobsAsArtifacts and supportCFC when omitted", () => {
		const config = new RunConfig();
		expect(config.saveInputBlobsAsArtifacts).toBe(false);
		expect(config.supportCFC).toBe(false);
	});

	it("applies || false when boolean flags are explicitly undefined", () => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: undefined,
			supportCFC: undefined,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(false);
		expect(config.supportCFC).toBe(false);
	});

	it("treats explicit false the same as omit for ||-defaulted booleans", () => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: false,
			supportCFC: false,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(false);
		expect(config.supportCFC).toBe(false);
	});

	it("preserves explicit true for boolean flags", () => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: true,
			supportCFC: true,
		});
		expect(config.saveInputBlobsAsArtifacts).toBe(true);
		expect(config.supportCFC).toBe(true);
	});

	it("defaults streamingMode to NONE via || when omitted or undefined", () => {
		expect(new RunConfig().streamingMode).toBe(StreamingMode.NONE);
		expect(new RunConfig({ streamingMode: undefined }).streamingMode).toBe(
			StreamingMode.NONE,
		);
	});

	it("accepts explicit streaming modes without coercion", () => {
		expect(
			new RunConfig({ streamingMode: StreamingMode.SSE }).streamingMode,
		).toBe(StreamingMode.SSE);
		expect(
			new RunConfig({ streamingMode: StreamingMode.BIDI }).streamingMode,
		).toBe(StreamingMode.BIDI);
	});

	it("defaults maxLlmCalls to 500 when omitted or undefined", () => {
		expect(new RunConfig().maxLlmCalls).toBe(500);
		expect(new RunConfig({ maxLlmCalls: undefined }).maxLlmCalls).toBe(500);
	});

	it("preserves positive maxLlmCalls overrides", () => {
		expect(new RunConfig({ maxLlmCalls: 1 }).maxLlmCalls).toBe(1);
		expect(new RunConfig({ maxLlmCalls: 499 }).maxLlmCalls).toBe(499);
	});

	it("warns via console.warn when maxLlmCalls is 0", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: 0 });
		expect(config.maxLlmCalls).toBe(0);
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][0]).toContain("less than or equal to 0");
	});

	it("warns via console.warn when maxLlmCalls is negative", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: -42 });
		expect(config.maxLlmCalls).toBe(-42);
		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0][0]).toContain("no enforcement");
	});

	it("throws when maxLlmCalls is Number.MAX_SAFE_INTEGER", () => {
		expect(
			() => new RunConfig({ maxLlmCalls: Number.MAX_SAFE_INTEGER }),
		).toThrow(/maxLlmCalls should be less than/);
	});

	it("allows MAX_SAFE_INTEGER minus one", () => {
		const config = new RunConfig({
			maxLlmCalls: Number.MAX_SAFE_INTEGER - 1,
		});
		expect(config.maxLlmCalls).toBe(Number.MAX_SAFE_INTEGER - 1);
	});

	it("leaves speechConfig undefined when not provided", () => {
		const config = new RunConfig();
		expect(config.speechConfig).toBeUndefined();
	});

	it("passes through speechConfig when provided", () => {
		const speechConfig = { languageCode: "en-US" } as any;
		const config = new RunConfig({ speechConfig });
		expect(config.speechConfig).toBe(speechConfig);
	});

	it("leaves transcription configs undefined when not provided", () => {
		const config = new RunConfig();
		expect(config.inputAudioTranscription).toBeUndefined();
		expect(config.outputAudioTranscription).toBeUndefined();
		expect(config.realtimeInputConfig).toBeUndefined();
	});

	it("passes through transcription and realtime configs when provided", () => {
		const inputAudioTranscription = { languageCode: "fr-FR" } as any;
		const outputAudioTranscription = { languageCode: "de-DE" } as any;
		const realtimeInputConfig = { automaticActivityDetection: {} } as any;
		const config = new RunConfig({
			inputAudioTranscription,
			outputAudioTranscription,
			realtimeInputConfig,
		});
		expect(config.inputAudioTranscription).toBe(inputAudioTranscription);
		expect(config.outputAudioTranscription).toBe(outputAudioTranscription);
		expect(config.realtimeInputConfig).toBe(realtimeInputConfig);
	});

	it("leaves proactivity undefined when not provided", () => {
		expect(new RunConfig().proactivity).toBeUndefined();
	});

	it("passes through proactivity when provided", () => {
		const proactivity = { proactiveAudio: true } as any;
		const config = new RunConfig({ proactivity });
		expect(config.proactivity).toBe(proactivity);
	});

	it("leaves enableAffectiveDialog undefined when not provided", () => {
		expect(new RunConfig().enableAffectiveDialog).toBeUndefined();
	});

	it("passes through enableAffectiveDialog when provided", () => {
		const config = new RunConfig({ enableAffectiveDialog: true });
		expect(config.enableAffectiveDialog).toBe(true);
	});

	it("leaves responseModalities undefined when not provided", () => {
		expect(new RunConfig().responseModalities).toBeUndefined();
	});

	it("passes through responseModalities when provided", () => {
		const modalities = ["AUDIO", "TEXT"];
		const config = new RunConfig({ responseModalities: modalities });
		expect(config.responseModalities).toBe(modalities);
	});
});
