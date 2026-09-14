import { afterEach, describe, expect, it, vi } from "vitest";
import { RunConfig, StreamingMode } from "../../agents/run-config";

describe("RunConfig || / ?? asymmetry leftover (post #168)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "empty-string", value: "" as any },
		{ label: "null", value: null as any },
		{ label: "0", value: 0 as any },
		{ label: "false", value: false as any },
	])("streamingMode $label coalesces to NONE via ||", ({ value }) => {
		const config = new RunConfig({ streamingMode: value });
		expect(config.streamingMode).toBe(StreamingMode.NONE);
	});

	it.each([
		{ label: "empty-string", value: "" as any },
		{ label: "null", value: null as any },
		{ label: "0", value: 0 as any },
	])("saveInputBlobsAsArtifacts $label coalesces to false via ||", ({
		value,
	}) => {
		const config = new RunConfig({ saveInputBlobsAsArtifacts: value });
		expect(config.saveInputBlobsAsArtifacts).toBe(false);
	});

	it.each([
		{ label: "empty-string", value: "" as any },
		{ label: "null", value: null as any },
		{ label: "0", value: 0 as any },
	])("supportCFC $label coalesces to false via ||", ({ value }) => {
		const config = new RunConfig({ supportCFC: value });
		expect(config.supportCFC).toBe(false);
	});

	it("maxLlmCalls null coalesces to 500 via ?? (contrast with || flags)", () => {
		const config = new RunConfig({ maxLlmCalls: null as any });
		expect(config.maxLlmCalls).toBe(500);
	});

	it("maxLlmCalls 0 is kept via ?? and warns (|| would have coalesced)", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: 0 });
		expect(config.maxLlmCalls).toBe(0);
		expect(warn).toHaveBeenCalled();
	});

	it("whitespace streamingMode string is truthy and kept", () => {
		const config = new RunConfig({ streamingMode: "   " as any });
		expect(config.streamingMode).toBe("   ");
	});
});
