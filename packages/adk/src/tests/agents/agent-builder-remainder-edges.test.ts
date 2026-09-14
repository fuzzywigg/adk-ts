import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { LoopAgent } from "../../agents/loop-agent.js";
import { LlmAgent } from "../../agents/llm-agent.js";
import { LangGraphAgent } from "../../agents/lang-graph-agent.js";
import { RunConfig, StreamingMode } from "../../agents/run-config.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";

describe("AgentBuilder remainder edges (overnight TOKENMAXX post #142)", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	it("withInputSchema wires schema onto built LlmAgent", async () => {
		const schema = z.object({ q: z.string() });
		const { agent } = await AgentBuilder.create("input_schema")
			.withModel("gemini-2.5-flash")
			.withInputSchema(schema)
			.build();

		expect(agent).toBeInstanceOf(LlmAgent);
		expect((agent as LlmAgent).inputSchema).toBe(schema);
	});

	it("withOutputSchema succeeds on loop agents", async () => {
		const child = new LlmAgent({
			name: "child",
			model: "gemini-2.5-flash",
		});
		const schema = z.object({ ok: z.boolean() });
		const builder = AgentBuilder.create("loop_out")
			.asLoop([child])
			.withOutputSchema(schema);

		expect((builder as any).config.outputSchema).toBe(schema);
		const { agent } = await builder.build();
		expect(agent).toBeInstanceOf(LoopAgent);
	});

	it("withOutputSchema succeeds on langgraph agents", async () => {
		const nodeAgent = new LlmAgent({
			name: "node",
			model: "gemini-2.5-flash",
		});
		const schema = z.object({ v: z.number() });
		const builder = AgentBuilder.create("lg_out")
			.asLangGraph([{ name: "node", agent: nodeAgent, targets: [] }], "node")
			.withOutputSchema(schema);

		expect((builder as any).config.outputSchema).toBe(schema);
		const { agent } = await builder.build();
		expect(agent).toBeInstanceOf(LangGraphAgent);
	});

	it("withOutputKey on loop does not warn and stores key on config", async () => {
		const child = new LlmAgent({
			name: "child",
			model: "gemini-2.5-flash",
		});
		const builder = AgentBuilder.create("loop_key").asLoop([child]);
		const warn = vi.spyOn((builder as any).logger, "warn");

		builder.withOutputKey("loop_result");
		expect((builder as any).config.outputKey).toBe("loop_result");
		expect(warn).not.toHaveBeenCalled();
	});

	it("withOutputKey on langgraph stores key without warning", () => {
		const nodeAgent = new LlmAgent({
			name: "node",
			model: "gemini-2.5-flash",
		});
		const builder = AgentBuilder.create("lg_key").asLangGraph(
			[{ name: "node", agent: nodeAgent, targets: [] }],
			"node",
		);
		const warn = vi.spyOn((builder as any).logger, "warn");

		builder.withOutputKey("lg_result");
		expect((builder as any).config.outputKey).toBe("lg_result");
		expect(warn).not.toHaveBeenCalled();
	});

	it("createAgent throws when sequential subAgents is a non-array", () => {
		const builder = AgentBuilder.create("seq_bad");
		(builder as any).agentType = "sequential";
		(builder as any).config.subAgents = { not: "array" };

		expect(() => (builder as any).createAgent()).toThrow(
			/Sub-agents required for sequential agent/,
		);
	});

	it("createAgent throws when langgraph nodes is a non-array", () => {
		const builder = AgentBuilder.create("lg_bad_nodes");
		(builder as any).agentType = "langgraph";
		(builder as any).config.nodes = { not: "array" };
		(builder as any).config.rootNode = "root";

		expect(() => (builder as any).createAgent()).toThrow(
			/Nodes and root node required for LangGraph agent/,
		);
	});

	it("createAgent throws when langgraph rootNode is a non-string", () => {
		const nodeAgent = new LlmAgent({
			name: "node",
			model: "gemini-2.5-flash",
		});
		const builder = AgentBuilder.create("lg_bad_root");
		(builder as any).agentType = "langgraph";
		(builder as any).config.nodes = [
			{ name: "node", agent: nodeAgent, targets: [] },
		];
		(builder as any).config.rootNode = 123;

		expect(() => (builder as any).createAgent()).toThrow(
			/Nodes and root node required for LangGraph agent/,
		);
	});

	it("withRunConfig(RunConfig instance) replaces prior Partial-merged config", () => {
		const builder = AgentBuilder.create("run_cfg")
			.withModel("gemini-2.5-flash")
			.withRunConfig({ streamingMode: StreamingMode.SSE });

		const instance = new RunConfig({
			streamingMode: StreamingMode.BIDI,
			maxLlmCalls: 7,
		});
		builder.withRunConfig(instance);

		expect((builder as any).runConfig).toBe(instance);
		expect((builder as any).runConfig.streamingMode).toBe(StreamingMode.BIDI);
		expect((builder as any).runConfig.maxLlmCalls).toBe(7);
	});

	it("generateDefaultAppName is app-${name}", () => {
		const builder = AgentBuilder.create("named_app").withSessionService(
			sessionService,
			{},
		);
		expect((builder as any).sessionOptions.appName).toBe("app-named_app");
	});

	it("asLoop when unlocked sets maxIterations default 3 via omitted second arg", () => {
		const child = new LlmAgent({
			name: "child",
			model: "gemini-2.5-flash",
		});
		const builder = AgentBuilder.create("loop_default").asLoop([child]);
		expect((builder as any).config.maxIterations).toBe(3);
		expect((builder as any).agentType).toBe("loop");
	});

	it("withDescription / withInstruction return this for chaining after lock warn", async () => {
		const agent = new LlmAgent({
			name: "locked",
			model: "gemini-2.5-flash",
		});
		const builder = AgentBuilder.withAgent(agent);
		const warn = vi.spyOn((builder as any).logger, "warn");

		const descRet = builder.withDescription("d");
		const instrRet = builder.withInstruction("i");

		expect(descRet).toBe(builder);
		expect(instrRet).toBe(builder);
		expect((builder as any).config.description).toBe("d");
		expect((builder as any).config.instruction).toBe("i");
		expect(warn).toHaveBeenCalled();
	});

	it("createAgent throws when parallel subAgents is empty array", () => {
		const builder = AgentBuilder.create("par_empty");
		(builder as any).agentType = "parallel";
		(builder as any).config.subAgents = [];

		expect(() => (builder as any).createAgent()).toThrow(
			/Sub-agents required for parallel agent/,
		);
	});

	it("createAgent throws when loop subAgents is a non-array", () => {
		const builder = AgentBuilder.create("loop_bad");
		(builder as any).agentType = "loop";
		(builder as any).config.subAgents = "nope";

		expect(() => (builder as any).createAgent()).toThrow(
			/Sub-agents required for loop agent/,
		);
	});

	it("loop createAgent uses maxIterations || 3 when maxIterations is 0", async () => {
		const child = new LlmAgent({
			name: "child",
			model: "gemini-2.5-flash",
		});
		const builder = AgentBuilder.create("loop_zero").asLoop([child], 0);
		expect((builder as any).config.maxIterations).toBe(0);

		const { agent } = await builder.build();
		expect(agent).toBeInstanceOf(LoopAgent);
		expect((agent as LoopAgent).maxIterations).toBe(3);
	});
});
