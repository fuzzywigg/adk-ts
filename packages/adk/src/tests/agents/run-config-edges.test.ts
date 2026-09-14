import { afterEach, describe, expect, it, vi } from "vitest";
import { RunConfig, StreamingMode } from "../../agents/run-config";

describe("RunConfig leftover edges", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("keeps optional live fields undefined when omitted", () => {
		const config = new RunConfig({});

		expect(config.speechConfig).toBeUndefined();
		expect(config.responseModalities).toBeUndefined();
		expect(config.outputAudioTranscription).toBeUndefined();
		expect(config.inputAudioTranscription).toBeUndefined();
		expect(config.realtimeInputConfig).toBeUndefined();
		expect(config.enableAffectiveDialog).toBeUndefined();
		expect(config.proactivity).toBeUndefined();
	});

	it("preserves explicit false for boolean flags via || defaults", () => {
		const config = new RunConfig({
			saveInputBlobsAsArtifacts: false,
			supportCFC: false,
		});

		expect(config.saveInputBlobsAsArtifacts).toBe(false);
		expect(config.supportCFC).toBe(false);
	});

	it("accepts StreamingMode.NONE explicitly without falling back", () => {
		const config = new RunConfig({ streamingMode: StreamingMode.NONE });
		expect(config.streamingMode).toBe(StreamingMode.NONE);
		expect(config.streamingMode).toBe("NONE");
	});

	it("enumerates StreamingMode members without duplicates", () => {
		const values = Object.values(StreamingMode);
		expect(values).toEqual(["NONE", "sse", "bidi"]);
		expect(new Set(values).size).toBe(3);
		expect(Object.keys(StreamingMode)).toEqual(
			expect.arrayContaining(["NONE", "SSE", "BIDI"]),
		);
	});

	it("does not warn for positive maxLlmCalls below MAX_SAFE_INTEGER", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const one = new RunConfig({ maxLlmCalls: 1 });
		const nearMax = new RunConfig({
			maxLlmCalls: Number.MAX_SAFE_INTEGER - 1,
		});

		expect(one.maxLlmCalls).toBe(1);
		expect(nearMax.maxLlmCalls).toBe(Number.MAX_SAFE_INTEGER - 1);
		expect(warn).not.toHaveBeenCalled();
	});

	it("warns with the unbounded-run guidance for maxLlmCalls of 0", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		new RunConfig({ maxLlmCalls: 0 });

		expect(warn).toHaveBeenCalledOnce();
		const message = String(warn.mock.calls[0][0]);
		expect(message).toContain("maxLlmCalls is less than or equal to 0");
		expect(message).toContain("never ending communication");
	});

	it("warns once for large negative maxLlmCalls", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const config = new RunConfig({ maxLlmCalls: -100 });

		expect(config.maxLlmCalls).toBe(-100);
		expect(warn).toHaveBeenCalledOnce();
	});

	it("throws before assigning other fields when maxLlmCalls is MAX_SAFE_INTEGER", () => {
		expect(
			() =>
				new RunConfig({
					maxLlmCalls: Number.MAX_SAFE_INTEGER,
					streamingMode: StreamingMode.SSE,
				}),
		).toThrow(`maxLlmCalls should be less than ${Number.MAX_SAFE_INTEGER}.`);
	});

	it("defaults maxLlmCalls via nullish coalescing when null is passed", () => {
		const config = new RunConfig({ maxLlmCalls: null as unknown as number });
		expect(config.maxLlmCalls).toBe(500);
	});

	it("wires empty responseModalities array distinctly from undefined", () => {
		const config = new RunConfig({ responseModalities: [] });
		expect(config.responseModalities).toEqual([]);
		expect(config.responseModalities).not.toBeUndefined();
	});

	it("preserves enableAffectiveDialog false distinctly from undefined", () => {
		const off = new RunConfig({ enableAffectiveDialog: false });
		const unset = new RunConfig();

		expect(off.enableAffectiveDialog).toBe(false);
		expect(unset.enableAffectiveDialog).toBeUndefined();
	});
});
