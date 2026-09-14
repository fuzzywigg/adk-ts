import { afterEach, describe, expect, it, vi } from "vitest";
import { RunConfig, StreamingMode } from "../../agents/run-config";

describe("RunConfig streamingMode || vs maxLlmCalls ?? fifth leftover", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "empty-string", value: "" as const },
		{ label: "null", value: null },
		{ label: "0", value: 0 as const },
		{ label: "false", value: false as const },
	])("$label streamingMode coalesces to NONE via ||", ({ value }) => {
		expect(new RunConfig({ streamingMode: value as any }).streamingMode).toBe(
			StreamingMode.NONE,
		);
	});

	it("maxLlmCalls 0 is preserved via ?? (asymmetry vs streamingMode ||)", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(new RunConfig({ maxLlmCalls: 0 }).maxLlmCalls).toBe(0);
		expect(warn).toHaveBeenCalled();
	});

	it.each([
		{ label: "null", value: null },
		{ label: "undefined", value: undefined },
	])("$label maxLlmCalls coalesces to 500 via ??", ({ value }) => {
		expect(new RunConfig({ maxLlmCalls: value as any }).maxLlmCalls).toBe(500);
	});

	it("NaN maxLlmCalls is preserved via ?? (NaN <= 0 is false so no warn)", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: Number.NaN });
		expect(Number.isNaN(config.maxLlmCalls)).toBe(true);
		expect(warn).not.toHaveBeenCalled();
	});

	it("SSE and BIDI streaming modes remain truthy and preserved", () => {
		expect(
			new RunConfig({ streamingMode: StreamingMode.SSE }).streamingMode,
		).toBe(StreamingMode.SSE);
		expect(
			new RunConfig({ streamingMode: StreamingMode.BIDI }).streamingMode,
		).toBe(StreamingMode.BIDI);
	});
});
