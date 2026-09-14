import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { LangGraphAgent } from "../../agents/lang-graph-agent.js";
import { LlmAgent } from "../../agents/llm-agent.js";
import { LoopAgent } from "../../agents/loop-agent.js";
import { ParallelAgent } from "../../agents/parallel-agent.js";
import { SequentialAgent } from "../../agents/sequential-agent.js";

function child(name: string) {
	return new LlmAgent({ name, model: "gemini-2.5-flash" });
}

/**
 * Eighteenth leftover: ninth leftover only maxIterations `"0"`; seventh only
 * rootNode `"0"`. Assert builder `description || ""` keeps `"0"`/`"false"`;
 * `maxIterations || 3` keeps `"false"`; rootNode `"false"` builds.
 */
describe("AgentBuilder description/maxIterations/rootNode false eighteenth leftover", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("sequential description $label is kept via ||", async ({ value }) => {
		const builder = AgentBuilder.create("seq_desc").asSequential([child("c")]);
		(builder as any).config.description = value;
		const { agent } = await builder.build();
		expect(agent).toBeInstanceOf(SequentialAgent);
		expect(agent.description).toBe(value);
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("parallel description $label is kept via ||", async ({ value }) => {
		const builder = AgentBuilder.create("par_desc").asParallel([child("c")]);
		(builder as any).config.description = value;
		const { agent } = await builder.build();
		expect(agent).toBeInstanceOf(ParallelAgent);
		expect(agent.description).toBe(value);
	});

	it('forced maxIterations "false" is kept via || 3 (NaN path at runtime)', async () => {
		const builder = AgentBuilder.create("loop_str_false").asLoop([child("c")]);
		(builder as any).config.maxIterations = "false";
		const { agent } = await builder.build();
		expect((agent as LoopAgent).maxIterations).toBe("false");
	});

	it("forced maxIterations false still coalesces to 3 (seventh control)", async () => {
		const builder = AgentBuilder.create("loop_bool_false").asLoop([child("c")]);
		(builder as any).config.maxIterations = false;
		const { agent } = await builder.build();
		expect((agent as LoopAgent).maxIterations).toBe(3);
	});

	it('langgraph rootNode "false" is a truthy string and builds', async () => {
		const nodeAgent = child("n");
		const { agent } = await AgentBuilder.create("lg_false_root")
			.asLangGraph([{ name: "false", agent: nodeAgent }], "false")
			.build();
		expect(agent).toBeInstanceOf(LangGraphAgent);
		expect((agent as LangGraphAgent).getRootNodeName()).toBe("false");
	});
});
