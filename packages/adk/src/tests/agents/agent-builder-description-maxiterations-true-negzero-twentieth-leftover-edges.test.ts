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
 * Twentieth leftover: eighteenth pins description `"false"` / maxIterations
 * `"false"` / rootNode `"false"`. Assert `description || ""` keeps boolean
 * `true` / `"true"` / `-Infinity` / `[]`; `-0` collapses to `""`.
 * `maxIterations || 3` keeps `true` / `"true"`; `-0` → 3. rootNode `"true"`.
 */
describe("AgentBuilder description/maxIterations/rootNode true twentieth leftover", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("sequential description $label is kept via ||", async ({ value }) => {
		const builder = AgentBuilder.create("seq_desc").asSequential([child("c")]);
		(builder as any).config.description = value;
		const { agent } = await builder.build();
		expect(agent).toBeInstanceOf(SequentialAgent);
		expect(agent.description).toBe(value);
	});

	it("sequential description -0 collapses to empty string via ||", async () => {
		const builder = AgentBuilder.create("seq_neg0").asSequential([child("c")]);
		(builder as any).config.description = -0;
		const { agent } = await builder.build();
		expect(agent.description).toBe("");
	});

	it("parallel description empty-array is kept via ||", async () => {
		const empty: never[] = [];
		const builder = AgentBuilder.create("par_arr").asParallel([child("c")]);
		(builder as any).config.description = empty;
		const { agent } = await builder.build();
		expect(agent).toBeInstanceOf(ParallelAgent);
		expect(agent.description).toBe(empty as any);
	});

	it("forced maxIterations true is kept via || 3 (one-run path at runtime)", async () => {
		const builder = AgentBuilder.create("loop_bool_true").asLoop([child("c")]);
		(builder as any).config.maxIterations = true;
		const { agent } = await builder.build();
		expect((agent as LoopAgent).maxIterations).toBe(true);
	});

	it('forced maxIterations "true" is kept via || 3 (NaN zero-run path)', async () => {
		const builder = AgentBuilder.create("loop_str_true").asLoop([child("c")]);
		(builder as any).config.maxIterations = "true";
		const { agent } = await builder.build();
		expect((agent as LoopAgent).maxIterations).toBe("true");
	});

	it("forced maxIterations -0 still coalesces to 3 (SameValueZero)", async () => {
		const builder = AgentBuilder.create("loop_neg0").asLoop([child("c")]);
		(builder as any).config.maxIterations = -0;
		const { agent } = await builder.build();
		expect((agent as LoopAgent).maxIterations).toBe(3);
	});

	it('langgraph rootNode "true" is a truthy string and builds', async () => {
		const nodeAgent = child("n");
		const { agent } = await AgentBuilder.create("lg_true_root")
			.asLangGraph([{ name: "true", agent: nodeAgent }], "true")
			.build();
		expect(agent).toBeInstanceOf(LangGraphAgent);
		expect((agent as LangGraphAgent).getRootNodeName()).toBe("true");
	});
});
