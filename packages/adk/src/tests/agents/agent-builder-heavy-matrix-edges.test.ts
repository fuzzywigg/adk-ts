import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { LoopAgent } from "../../agents/loop-agent.js";
import { LlmAgent } from "../../agents/llm-agent.js";
import { ParallelAgent } from "../../agents/parallel-agent.js";
import { SequentialAgent } from "../../agents/sequential-agent.js";
import { BaseAgent } from "../../agents/base-agent.js";
import { createTool } from "../../tools/base/create-tool.js";

class ShellAgent extends BaseAgent {
	protected async *runAsyncImpl() {}
	protected async *runLiveImpl() {}
}

describe("AgentBuilder heavy matrix leftover edges", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe("definitionLocked warnIfLocked matrix", () => {
		const lockedMethods = [
			{
				name: "withModel",
				apply: (b: AgentBuilder) => b.withModel("gemini-2.5-flash"),
			},
			{
				name: "withTools",
				apply: (b: AgentBuilder) =>
					b.withTools(
						createTool({
							name: "tool_t",
							description: "test tool",
							fn: () => "x",
						}),
					),
			},
			{
				name: "withInstruction",
				apply: (b: AgentBuilder) => b.withInstruction("locked"),
			},
			{
				name: "asLoop",
				apply: (b: AgentBuilder) =>
					b.asLoop([new LlmAgent({ name: "lc", model: "gemini-2.5-flash" })]),
			},
			{
				name: "asLangGraph",
				apply: (b: AgentBuilder) => {
					const node = new ShellAgent({ name: "n", description: "" });
					return b.asLangGraph([{ name: "n", agent: node, targets: [] }], "n");
				},
			},
		] as const;

		it.each(
			lockedMethods,
		)("$name warns after withAgent and build returns locked agent", async ({
			name,
			apply,
		}) => {
			const wrapped = new LlmAgent({
				name: "wrapped",
				model: "gemini-2.5-flash",
			});
			const builder = AgentBuilder.withAgent(wrapped);
			const warn = vi.spyOn((builder as any).logger, "warn");
			apply(builder);
			const { agent } = await builder.build();
			expect(agent).toBe(wrapped);
			expect(
				warn.mock.calls.some((c) => String(c[0]).includes(`${name}() ignored`)),
			).toBe(true);
		});
	});

	describe("asSequential/asParallel when locked", () => {
		it.each([
			"asSequential",
			"asParallel",
		] as const)("%s warns and keeps wrapped agent type", async (method) => {
			const wrapped = new LlmAgent({
				name: "stay_llm",
				model: "gemini-2.5-flash",
			});
			const child = new LlmAgent({
				name: "child",
				model: "gemini-2.5-flash",
			});
			const builder = AgentBuilder.withAgent(wrapped);
			const warn = vi.spyOn((builder as any).logger, "warn");
			if (method === "asSequential") {
				builder.asSequential([child]);
			} else {
				builder.asParallel([child]);
			}
			const { agent } = await builder.build();
			expect(agent).toBe(wrapped);
			expect(agent).toBeInstanceOf(LlmAgent);
			expect(
				warn.mock.calls.some((c) =>
					String(c[0]).includes(`${method}() ignored`),
				),
			).toBe(true);
		});
	});

	describe("asLoop maxIterations matrix", () => {
		function loopChild() {
			return new LlmAgent({
				name: "loop_child",
				model: "gemini-2.5-flash",
			});
		}

		it.each([
			{
				label: "default param 3",
				maxIterations: undefined,
				stored: 3,
				built: 3,
			},
			{ label: "explicit 0", maxIterations: 0, stored: 0, built: 3 },
			{ label: "positive 5", maxIterations: 5, stored: 5, built: 5 },
			{ label: "positive 1", maxIterations: 1, stored: 1, built: 1 },
		])("$label: config stores $stored, createAgent uses $built", async ({
			maxIterations,
			stored,
			built,
		}) => {
			const builder =
				maxIterations === undefined
					? AgentBuilder.create("loop_mx").asLoop([loopChild()])
					: AgentBuilder.create("loop_mx").asLoop([loopChild()], maxIterations);
			expect((builder as any).config.maxIterations).toBe(stored);
			const { agent } = await builder.build();
			expect(agent).toBeInstanceOf(LoopAgent);
			expect((agent as LoopAgent).maxIterations).toBe(built);
		});
	});

	describe("createAgent validation errors", () => {
		it.each([
			{
				label: "llm without model",
				setup: () => AgentBuilder.create("no_model"),
				message: "Model is required for LLM agent",
			},
			{
				label: "sequential empty subAgents",
				setup: () => AgentBuilder.create("seq_empty").asSequential([]),
				message: "Sub-agents required for sequential agent",
			},
			{
				label: "parallel empty subAgents",
				setup: () => AgentBuilder.create("par_empty").asParallel([]),
				message: "Sub-agents required for parallel agent",
			},
			{
				label: "loop empty subAgents",
				setup: () => AgentBuilder.create("loop_empty").asLoop([]),
				message: "Sub-agents required for loop agent",
			},
			{
				label: "langgraph missing nodes",
				setup: () => AgentBuilder.create("lg_empty").asLangGraph([], "missing"),
				message: "Nodes and root node required for LangGraph agent",
			},
			{
				label: "langgraph missing rootNode",
				setup: () => {
					const node = new ShellAgent({ name: "n", description: "" });
					const b = AgentBuilder.create("lg_no_root");
					(b as any).agentType = "langgraph";
					(b as any).config.nodes = [{ name: "n", agent: node, targets: [] }];
					(b as any).config.rootNode = undefined;
					return b;
				},
				message: "Nodes and root node required for LangGraph agent",
			},
		])("$label throws", async ({ setup, message }) => {
			await expect(setup().build()).rejects.toThrow(message);
		});
	});

	describe("sequential/parallel description || empty string", () => {
		it.each([
			{ method: "asSequential" as const, type: SequentialAgent },
			{ method: "asParallel" as const, type: ParallelAgent },
		])("$method uses description || empty string", async ({ method, type }) => {
			const child = new LlmAgent({
				name: "desc_child",
				model: "gemini-2.5-flash",
			});
			const builder = AgentBuilder.create(`agg_${method}`);
			(builder as any).config.description = undefined;
			if (method === "asSequential") {
				builder.asSequential([child]);
			} else {
				builder.asParallel([child]);
			}
			const { agent } = await builder.build();
			expect(agent).toBeInstanceOf(type);
			expect(agent.description).toBe("");
		});
	});
});
