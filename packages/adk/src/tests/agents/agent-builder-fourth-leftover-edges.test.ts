import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { LangGraphAgent } from "../../agents/lang-graph-agent.js";
import { LlmAgent } from "../../agents/llm-agent.js";
import { LoopAgent } from "../../agents/loop-agent.js";
import { ParallelAgent } from "../../agents/parallel-agent.js";
import { RunConfig, StreamingMode } from "../../agents/run-config.js";
import { SequentialAgent } from "../../agents/sequential-agent.js";
import { BasePlugin } from "../../plugins/base-plugin.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";
import { createTool } from "../../tools/base/create-tool.js";

class StubPlugin extends BasePlugin {
	constructor(name = "stub") {
		super(name);
	}
}

describe("AgentBuilder fourth leftover edges — fluent chaining", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	it("create(name) stores the provided name", () => {
		const builder = AgentBuilder.create("named_fourth");
		expect((builder as any).config.name).toBe("named_fourth");
	});

	it("withModel static factory seeds default_agent and model", () => {
		const builder = AgentBuilder.withModel("gemini-2.5-flash");
		expect((builder as any).config.name).toBe("default_agent");
		expect((builder as any).config.model).toBe("gemini-2.5-flash");
	});

	it("chains description, instruction, outputKey, and subAgents", async () => {
		const child = new LlmAgent({
			name: "child_chain",
			model: "gemini-2.5-flash",
		});
		const { agent } = await AgentBuilder.create("fluent_llm")
			.withModel("gemini-2.5-flash")
			.withDescription("desc-fourth")
			.withInstruction("instr-fourth")
			.withOutputKey("out_key")
			.withSubAgents([child])
			.build();

		expect(agent).toBeInstanceOf(LlmAgent);
		expect(agent.description).toBe("desc-fourth");
		expect((agent as LlmAgent).instruction).toBe("instr-fourth");
		expect((agent as LlmAgent).outputKey).toBe("out_key");
		expect(agent.subAgents).toContain(child);
	});

	it("chains input and output schemas onto llm agents", async () => {
		const input = z.object({ q: z.string() });
		const output = z.object({ a: z.string() });
		const { agent } = await AgentBuilder.create("schema_chain")
			.withModel("gemini-2.5-flash")
			.withInputSchema(input)
			.withOutputSchema(output)
			.build();
		expect((agent as LlmAgent).inputSchema).toBe(input);
		expect((agent as LlmAgent).outputSchema).toBe(output);
	});

	it("rejects outputSchema on sequential aggregators", () => {
		const child = new LlmAgent({
			name: "seq_child",
			model: "gemini-2.5-flash",
		});
		expect(() =>
			AgentBuilder.create("seq_schema")
				.asSequential([child])
				.withOutputSchema(z.object({ x: z.number() })),
		).toThrow(/cannot be applied to sequential or parallel/);
	});

	it("rejects outputSchema on parallel aggregators", () => {
		const child = new LlmAgent({
			name: "par_child",
			model: "gemini-2.5-flash",
		});
		expect(() =>
			AgentBuilder.create("par_schema")
				.asParallel([child])
				.withOutputSchema(z.object({ x: z.number() })),
		).toThrow(/cannot be applied to sequential or parallel/);
	});

	it("ignores outputKey on sequential aggregators with a warn", async () => {
		const child = new LlmAgent({
			name: "seq_ok",
			model: "gemini-2.5-flash",
		});
		const builder = AgentBuilder.create("seq_outkey").asSequential([child]);
		const warn = vi.spyOn((builder as any).logger, "warn");
		builder.withOutputKey("ignored");
		expect(warn).toHaveBeenCalled();
		expect((builder as any).config.outputKey).toBeUndefined();
	});

	it("accumulates tools across repeated withTools calls", async () => {
		const a = createTool({
			name: "a",
			description: "tool a for accumulate matrix",
			fn: () => "a",
		});
		const b = createTool({
			name: "b",
			description: "tool b for accumulate matrix",
			fn: () => "b",
		});
		const c = createTool({
			name: "c",
			description: "tool c for accumulate matrix",
			fn: () => "c",
		});
		const { agent } = await AgentBuilder.create("tools_acc")
			.withModel("gemini-2.5-flash")
			.withTools(a, b)
			.withTools(c)
			.build();
		expect((agent as LlmAgent).tools).toEqual([a, b, c]);
	});

	it("accumulates plugins across repeated withPlugins calls", () => {
		const p1 = new StubPlugin("p1");
		const p2 = new StubPlugin("p2");
		const builder = AgentBuilder.create("plug_acc")
			.withModel("gemini-2.5-flash")
			.withPlugins(p1)
			.withPlugins(p2);
		expect((builder as any).config.plugins).toEqual([p1, p2]);
	});

	it("stores planner and codeExecutor when chained", async () => {
		const planner = { name: "plan" } as any;
		const codeExecutor = { execute: vi.fn() } as any;
		const { agent } = await AgentBuilder.create("plan_code")
			.withModel("gemini-2.5-flash")
			.withPlanner(planner)
			.withCodeExecutor(codeExecutor)
			.build();
		expect((agent as LlmAgent).planner).toBe(planner);
		expect((agent as LlmAgent).codeExecutor).toBe(codeExecutor);
	});

	it("stores agent lifecycle and model/tool callbacks", async () => {
		const beforeAgent = vi.fn();
		const afterAgent = vi.fn();
		const beforeModel = vi.fn();
		const afterModel = vi.fn();
		const beforeTool = vi.fn();
		const afterTool = vi.fn();
		const { agent } = await AgentBuilder.create("cb_chain")
			.withModel("gemini-2.5-flash")
			.withBeforeAgentCallback(beforeAgent)
			.withAfterAgentCallback(afterAgent)
			.withBeforeModelCallback(beforeModel)
			.withAfterModelCallback(afterModel)
			.withBeforeToolCallback(beforeTool)
			.withAfterToolCallback(afterTool)
			.build();
		expect(agent.beforeAgentCallback).toBe(beforeAgent);
		expect(agent.afterAgentCallback).toBe(afterAgent);
		expect((agent as LlmAgent).beforeModelCallback).toBe(beforeModel);
		expect((agent as LlmAgent).afterModelCallback).toBe(afterModel);
		expect((agent as LlmAgent).beforeToolCallback).toBe(beforeTool);
		expect((agent as LlmAgent).afterToolCallback).toBe(afterTool);
	});

	it("asSequential / asParallel / asLoop switch agent types", async () => {
		const child = new LlmAgent({
			name: "typed_child",
			model: "gemini-2.5-flash",
		});
		const seq = await AgentBuilder.create("as_seq")
			.asSequential([child])
			.build();
		expect(seq.agent).toBeInstanceOf(SequentialAgent);

		const child2 = new LlmAgent({
			name: "typed_child2",
			model: "gemini-2.5-flash",
		});
		const par = await AgentBuilder.create("as_par")
			.asParallel([child2])
			.build();
		expect(par.agent).toBeInstanceOf(ParallelAgent);

		const child3 = new LlmAgent({
			name: "typed_child3",
			model: "gemini-2.5-flash",
		});
		const loop = await AgentBuilder.create("as_loop")
			.asLoop([child3], 5)
			.build();
		expect(loop.agent).toBeInstanceOf(LoopAgent);
		expect((loop.agent as LoopAgent).maxIterations).toBe(5);
	});

	it("asLangGraph builds a LangGraphAgent with root and nodes", async () => {
		const n1 = new LlmAgent({ name: "lg_n1", model: "gemini-2.5-flash" });
		const n2 = new LlmAgent({ name: "lg_n2", model: "gemini-2.5-flash" });
		const { agent } = await AgentBuilder.create("as_lg")
			.asLangGraph(
				[
					{ name: "lg_n1", agent: n1, targets: ["lg_n2"] },
					{ name: "lg_n2", agent: n2, targets: [] },
				],
				"lg_n1",
			)
			.build();
		expect(agent).toBeInstanceOf(LangGraphAgent);
		expect((agent as LangGraphAgent).getRootNodeName()).toBe("lg_n1");
	});

	it("withRunConfig accepts RunConfig instances and partials", async () => {
		const config = new RunConfig({
			streamingMode: StreamingMode.SSE,
			maxLlmCalls: 10,
		});
		const builder = AgentBuilder.create("run_cfg")
			.withModel("gemini-2.5-flash")
			.withRunConfig(config);
		expect((builder as any).runConfig).toBe(config);

		const partial = AgentBuilder.create("run_partial")
			.withModel("gemini-2.5-flash")
			.withRunConfig({ maxLlmCalls: 3 });
		expect((partial as any).runConfig.maxLlmCalls).toBe(3);
	});

	it("withMemory and withArtifactService store services on builder fields", () => {
		const memory = { add: vi.fn() } as any;
		const artifacts = { save: vi.fn() } as any;
		const builder = AgentBuilder.create("services")
			.withModel("gemini-2.5-flash")
			.withMemory(memory)
			.withArtifactService(artifacts);
		expect((builder as any).memoryService).toBe(memory);
		expect((builder as any).artifactService).toBe(artifacts);
	});

	it("withQuickSession seeds session options", async () => {
		const { session } = await AgentBuilder.create("quick")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService)
			.withQuickSession({ userId: "quick-user", appName: "quick-app" })
			.build();
		expect(session.userId).toBe("quick-user");
		expect(session.appName).toBe("quick-app");
	});

	it("withAgent locks definition and returns the provided agent", async () => {
		const existing = new LlmAgent({
			name: "prebuilt",
			model: "gemini-2.5-flash",
		});
		const builder = AgentBuilder.create("wrapper").withAgent(existing);
		expect((builder as any).definitionLocked).toBe(true);
		const { agent } = await builder.build();
		expect(agent).toBe(existing);
	});

	it("warnIfLocked warns but still applies mutation after withAgent lock", () => {
		const existing = new LlmAgent({
			name: "locked_agent",
			model: "gemini-2.5-flash",
		});
		const builder = AgentBuilder.withAgent(existing);
		const warn = vi.spyOn((builder as any).logger, "warn");
		builder.withDescription("ignored-desc");
		expect(warn).toHaveBeenCalled();
		expect(String(warn.mock.calls[0]?.[0])).toContain("withDescription");
		expect((builder as any).config.description).toBe("ignored-desc");
	});

	it("buildWithSchema returns agent when output schema is set", async () => {
		const schema = z.object({ value: z.string() });
		const built = await AgentBuilder.create("schema_build")
			.withModel("gemini-2.5-flash")
			.withOutputSchema(schema)
			.buildWithSchema();
		expect(built.agent).toBeInstanceOf(LlmAgent);
		expect((built.agent as LlmAgent).outputSchema).toBe(schema);
	});
});
