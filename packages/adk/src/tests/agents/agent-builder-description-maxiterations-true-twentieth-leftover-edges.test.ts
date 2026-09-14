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
 * Twentieth leftover: eighteenth pins description/maxIterations/rootNode
 * `"false"`. Residual string-truthy `"true"` keep via `||`, plus boolean
 * `true` maxIterations kept (vs false → 3).
 */
describe("AgentBuilder description/maxIterations/rootNode true twentieth leftover", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('sequential description "true" is kept via ||', async () => {
		const builder = AgentBuilder.create("seq_true").asSequential([child("c")]);
		(builder as any).config.description = "true";
		const { agent } = await builder.build();
		expect(agent).toBeInstanceOf(SequentialAgent);
		expect(agent.description).toBe("true");
	});

	it('parallel description "true" is kept via ||', async () => {
		const builder = AgentBuilder.create("par_true").asParallel([child("c")]);
		(builder as any).config.description = "true";
		const { agent } = await builder.build();
		expect(agent).toBeInstanceOf(ParallelAgent);
		expect(agent.description).toBe("true");
	});

	it('forced maxIterations "true" is kept via || 3 (NaN path at runtime)', async () => {
		const builder = AgentBuilder.create("loop_str_true").asLoop([child("c")]);
		(builder as any).config.maxIterations = "true";
		const { agent } = await builder.build();
		expect((agent as LoopAgent).maxIterations).toBe("true");
	});

	it("forced maxIterations boolean true is kept via || 3", async () => {
		const builder = AgentBuilder.create("loop_bool_true").asLoop([child("c")]);
		(builder as any).config.maxIterations = true;
		const { agent } = await builder.build();
		expect((agent as LoopAgent).maxIterations).toBe(true);
	});

	it("forced maxIterations false still coalesces to 3 (eighteenth control)", async () => {
		const builder = AgentBuilder.create("loop_bool_false").asLoop([child("c")]);
		(builder as any).config.maxIterations = false;
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
