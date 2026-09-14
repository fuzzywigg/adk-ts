import { describe, expect, it } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { RunConfig, StreamingMode } from "../../agents/run-config.js";

/**
 * Eighth leftover: withRunConfig Partial merge spreads `...(this.runConfig || {})`.
 * Prior leftovers covered undefined prior; forced null/0/false also hit `|| {}`.
 */
describe("AgentBuilder withRunConfig prior falsy || eighth leftover", () => {
	it.each([
		{ label: "null", value: null },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: '""', value: "" },
	])("forced prior runConfig $label still merges Partial via || {}", ({
		value,
	}) => {
		const builder =
			AgentBuilder.create("rc_falsy").withModel("gemini-2.5-flash");
		(builder as any).runConfig = value;
		builder.withRunConfig({ streamingMode: StreamingMode.SSE });
		const rc = (builder as any).runConfig as RunConfig;
		expect(rc).toBeInstanceOf(RunConfig);
		expect(rc.streamingMode).toBe(StreamingMode.SSE);
	});

	it("RunConfig instance still replaces without reading prior || {}", () => {
		const builder = AgentBuilder.create("rc_inst")
			.withModel("gemini-2.5-flash")
			.withRunConfig({ streamingMode: StreamingMode.SSE });
		(builder as any).runConfig = null;
		const instance = new RunConfig({ streamingMode: StreamingMode.BIDI });
		builder.withRunConfig(instance);
		expect((builder as any).runConfig).toBe(instance);
	});
});
