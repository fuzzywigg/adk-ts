import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { LangGraphAgent } from "../../agents/lang-graph-agent.js";
import { LlmAgent } from "../../agents/llm-agent.js";
import { LoopAgent } from "../../agents/loop-agent.js";
import { ParallelAgent } from "../../agents/parallel-agent.js";
import { RunConfig, StreamingMode } from "../../agents/run-config.js";
import { SequentialAgent } from "../../agents/sequential-agent.js";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service.js";
import { BaseCodeExecutor } from "../../code-executors/base-code-executor.js";
import { Event } from "../../events/event.js";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service.js";
import { BuiltInPlanner } from "../../planners/built-in-planner.js";
import { BasePlugin } from "../../plugins/base-plugin.js";
import { Runner } from "../../runners.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";
import { createTool } from "../../tools/base/create-tool.js";

class StubCodeExecutor extends BaseCodeExecutor {
	async executeCode() {
		return { stdout: "ok", stderr: "", outputFiles: [] };
	}
}

class StubPlugin extends BasePlugin {
	constructor() {
		super("stub-plugin");
	}
}

describe("AgentBuilder", () => {
	let sessionService: InMemorySessionService;
	let memoryService: InMemoryMemoryService;
	let artifactService: InMemoryArtifactService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		memoryService = new InMemoryMemoryService();
		artifactService = new InMemoryArtifactService();
		vi.clearAllMocks();
	});

	describe("Static factory methods", () => {
		it("should create instance with create()", () => {
			const builder = AgentBuilder.create("test_agent");
			expect(builder).toBeInstanceOf(AgentBuilder);
		});

		it("should create instance with default name", () => {
			const builder = AgentBuilder.create();
			expect(builder).toBeInstanceOf(AgentBuilder);
		});

		it("should create instance with withModel()", () => {
			const builder = AgentBuilder.withModel("gemini-2.5-flash");
			expect(builder).toBeInstanceOf(AgentBuilder);
		});
	});

	describe("Configuration methods", () => {
		let builder: AgentBuilder;

		beforeEach(() => {
			builder = AgentBuilder.create("test_agent");
		});

		it("should configure model", () => {
			const result = builder.withModel("gemini-2.5-flash");
			expect(result).toBe(builder); // Should return same instance for chaining
		});

		it("should configure description", () => {
			const result = builder.withDescription("Test description");
			expect(result).toBe(builder);
		});

		it("should configure instruction", () => {
			const result = builder.withInstruction("Test instruction");
			expect(result).toBe(builder);
		});

		it("should configure tools", () => {
			const tool = createTool({
				name: "test_tool",
				description: "A test tool",
				fn: () => "test result",
			});
			const result = builder.withTools(tool);
			expect(result).toBe(builder);
		});

		it("should add multiple tools", () => {
			const tool1 = createTool({
				name: "tool1",
				description: "Tool 1",
				fn: () => "result1",
			});
			const tool2 = createTool({
				name: "tool2",
				description: "Tool 2",
				fn: () => "result2",
			});
			const result = builder.withTools(tool1, tool2);
			expect(result).toBe(builder);
		});
	});

	describe("Session configuration", () => {
		let builder: AgentBuilder;

		beforeEach(() => {
			builder = AgentBuilder.create("test_agent").withModel("gemini-2.5-flash");
		});

		it("should configure session with service and options", () => {
			const result = builder.withSessionService(sessionService, {
				userId: "user123",
				appName: "testapp",
			});
			expect(result).toBe(builder);
		});

		it("should configure session with service only", () => {
			const result = builder.withSessionService(sessionService);
			expect(result).toBe(builder);
		});

		it("should configure session with empty options", () => {
			const result = builder.withSessionService(sessionService, {});
			expect(result).toBe(builder);
		});

		it("should configure quick session", () => {
			const result = builder.withQuickSession({
				userId: "user123",
				appName: "testapp",
			});
			expect(result).toBe(builder);
		});

		it("should configure quick session with no options", () => {
			const result = builder.withQuickSession();
			expect(result).toBe(builder);
		});
	});

	describe("Memory and Artifact services", () => {
		let builder: AgentBuilder;

		beforeEach(() => {
			builder = AgentBuilder.create("test_agent").withModel("gemini-2.5-flash");
		});

		it("should configure memory service", () => {
			const result = builder.withMemory(memoryService);
			expect(result).toBe(builder);
		});

		it("should configure artifact service", () => {
			const result = builder.withArtifactService(artifactService);
			expect(result).toBe(builder);
		});

		it("should configure both memory and artifact services", () => {
			const result = builder
				.withMemory(memoryService)
				.withArtifactService(artifactService);
			expect(result).toBe(builder);
		});
	});

	describe("Agent type configuration", () => {
		let builder: AgentBuilder;
		let mockAgent: LlmAgent;

		beforeEach(() => {
			builder = AgentBuilder.create("test_agent");
			mockAgent = new LlmAgent({
				name: "mock_agent",
				model: "gemini-2.5-flash",
				description: "Mock agent for testing",
			});
		});

		it("should configure as sequential agent", () => {
			const result = builder.asSequential([mockAgent]);
			expect(result).toBe(builder);
		});

		it("should configure as parallel agent", () => {
			const result = builder.asParallel([mockAgent]);
			expect(result).toBe(builder);
		});

		it("should configure as loop agent", () => {
			const result = builder.asLoop([mockAgent], 5);
			expect(result).toBe(builder);
		});

		it("should configure as loop agent with default iterations", () => {
			const result = builder.asLoop([mockAgent]);
			expect(result).toBe(builder);
		});

		it("should configure as LangGraph agent", () => {
			const nodes = [
				{
					name: "start",
					agent: mockAgent,
					targets: ["end"],
				},
				{
					name: "end",
					agent: mockAgent,
					targets: [],
				},
			];
			const result = builder.asLangGraph(nodes, "start");
			expect(result).toBe(builder);
		});
	});

	describe("Building agents", () => {
		it("should build LLM agent successfully", async () => {
			const { agent, runner, session } = await AgentBuilder.create("test_llm")
				.withModel("gemini-2.5-flash")
				.build();

			expect(agent).toBeInstanceOf(LlmAgent);
			expect(runner).toBeDefined();
			expect(session).toBeDefined();
			expect(runner.ask).toBeInstanceOf(Function);
		});

		it("should build sequential agent successfully", async () => {
			const subAgent = new LlmAgent({
				name: "sub_agent",
				model: "gemini-2.5-flash",
				description: "Sub agent for testing",
			});

			const { agent } = await AgentBuilder.create("test_sequential")
				.asSequential([subAgent])
				.build();

			expect(agent).toBeInstanceOf(SequentialAgent);
		});

		it("should build parallel agent successfully", async () => {
			const subAgent = new LlmAgent({
				name: "sub_agent",
				model: "gemini-2.5-flash",
				description: "Sub agent for testing",
			});

			const { agent } = await AgentBuilder.create("test_parallel")
				.asParallel([subAgent])
				.build();

			expect(agent).toBeInstanceOf(ParallelAgent);
		});

		it("should build loop agent successfully", async () => {
			const subAgent = new LlmAgent({
				name: "sub_agent",
				model: "gemini-2.5-flash",
				description: "Sub agent for testing",
			});

			const { agent } = await AgentBuilder.create("test_loop")
				.asLoop([subAgent])
				.build();

			expect(agent).toBeInstanceOf(LoopAgent);
		});

		it("should build LangGraph agent successfully", async () => {
			const subAgent = new LlmAgent({
				name: "sub_agent",
				model: "gemini-2.5-flash",
				description: "Sub agent for testing",
			});

			const nodes = [
				{
					name: "start",
					agent: subAgent,
					targets: [],
				},
			];

			const { agent } = await AgentBuilder.create("test_langgraph")
				.asLangGraph(nodes, "start")
				.build();

			expect(agent).toBeInstanceOf(LangGraphAgent);
		});

		it("should create default session when none provided", async () => {
			const { session } = await AgentBuilder.create("test_agent")
				.withModel("gemini-2.5-flash")
				.build();

			expect(session).toBeDefined();
			expect(session.id).toBeDefined();
		});

		it("should use provided session service", async () => {
			const { session } = await AgentBuilder.create("test_agent")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService, {
					userId: "user123",
					appName: "testapp",
				})
				.build();

			expect(session).toBeDefined();
			expect(session.userId).toBe("user123");
			expect(session.appName).toBe("testapp");
		});
	});

	describe("Error handling", () => {
		it("should throw error when building LLM agent without model", async () => {
			await expect(AgentBuilder.create("test_agent").build()).rejects.toThrow(
				"Model is required for LLM agent",
			);
		});

		it("should throw error when building sequential agent without sub_agents", async () => {
			await expect(
				AgentBuilder.create("test_agent").asSequential([]).build(),
			).rejects.toThrow("Sub-agents required for sequential agent");
		});

		it("should throw error when building parallel agent without sub_agents", async () => {
			await expect(
				AgentBuilder.create("test_agent").asParallel([]).build(),
			).rejects.toThrow("Sub-agents required for parallel agent");
		});

		it("should throw error when building loop agent without sub_agents", async () => {
			await expect(
				AgentBuilder.create("test_agent").asLoop([]).build(),
			).rejects.toThrow("Sub-agents required for loop agent");
		});

		it("should throw error when building LangGraph agent without nodes", async () => {
			await expect(
				AgentBuilder.create("test_agent").asLangGraph([], "start").build(),
			).rejects.toThrow("Nodes and root node required for LangGraph agent");
		});

		it("should throw error when building LangGraph agent without root node", async () => {
			const mockAgent = new LlmAgent({
				name: "mock_agent",
				model: "gemini-2.5-flash",
				description: "Mock agent for testing",
			});

			const nodes = [
				{
					name: "start",
					agent: mockAgent,
					targets: [],
				},
			];

			await expect(
				AgentBuilder.create("test_agent").asLangGraph(nodes, "").build(),
			).rejects.toThrow("Nodes and root node required for LangGraph agent");
		});
	});

	describe("Integration tests", () => {
		it("should work with all services configured", async () => {
			const tool = createTool({
				name: "test_tool",
				description: "A test tool",
				fn: () => "test result",
			});

			const { agent, runner, session } = await AgentBuilder.create(
				"integration_test",
			)
				.withModel("gemini-2.5-flash")
				.withDescription("Integration test agent")
				.withInstruction("You are a test agent")
				.withTools(tool)
				.withMemory(memoryService)
				.withArtifactService(artifactService)
				.withSessionService(sessionService, {
					userId: "test-user",
					appName: "test-app",
				})
				.build();

			expect(agent).toBeInstanceOf(LlmAgent);
			expect(runner).toBeDefined();
			expect(session).toBeDefined();
			expect(session.userId).toBe("test-user");
			expect(session.appName).toBe("test-app");
		});

		it("should work with methods called in different order", async () => {
			const { agent, runner } = await AgentBuilder.create("order_test")
				.withSessionService(sessionService, {
					userId: "user1",
					appName: "app1",
				})
				.withArtifactService(artifactService)
				.withModel("gemini-2.5-flash")
				.withMemory(memoryService)
				.withDescription("Order test agent")
				.build();

			expect(agent).toBeInstanceOf(LlmAgent);
			expect(runner).toBeDefined();
		});

		it("should work with minimal configuration", async () => {
			const { agent, runner, session } =
				await AgentBuilder.withModel("gemini-2.5-flash").build();

			expect(agent).toBeInstanceOf(LlmAgent);
			expect(runner).toBeDefined();
			expect(session).toBeDefined();
		});
	});

	describe("Enhanced runner functionality", () => {
		it("should provide ask method that returns string", async () => {
			const { runner } = await AgentBuilder.create("ask_test")
				.withModel("gemini-2.5-flash")
				.build();

			expect(runner.ask).toBeInstanceOf(Function);
			// Note: We can't easily test the actual ask functionality without mocking the LLM
		});

		it("should provide runAsync method", async () => {
			const { runner, session } = await AgentBuilder.create("run_async_test")
				.withModel("gemini-2.5-flash")
				.build();

			expect(runner.runAsync).toBeInstanceOf(Function);

			// Test that runAsync returns an async iterable
			const result = runner.runAsync({
				userId: session.userId,
				sessionId: session.id,
				newMessage: { parts: [{ text: "test" }] },
			});

			expect(result).toBeDefined();
			expect(typeof result[Symbol.asyncIterator]).toBe("function");
		});
	});

	describe("Default value generation", () => {
		it("should generate default userId when not provided", async () => {
			const { session } = await AgentBuilder.create("default_user_test")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService)
				.build();

			expect(session.userId).toBeDefined();
			expect(session.userId).toMatch(/^user-default_user_test-/);
		});

		it("should generate default appName when not provided", async () => {
			const { session } = await AgentBuilder.create("default_app_test")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService)
				.build();

			expect(session.appName).toBeDefined();
			expect(session.appName).toBe("app-default_app_test");
		});
	});

	describe("Advanced configuration applied on build", () => {
		it("applies planner, codeExecutor, outputKey, subAgents, and callbacks", async () => {
			const planner = new BuiltInPlanner({
				thinkingConfig: { includeThoughts: true },
			});
			const codeExecutor = new StubCodeExecutor();
			const sub = new LlmAgent({
				name: "child_agent",
				model: "gemini-2.5-flash",
			});
			const beforeAgent = vi.fn(() => undefined);
			const afterAgent = vi.fn(() => undefined);
			const beforeModel = vi.fn(() => undefined);
			const afterModel = vi.fn(() => undefined);
			const beforeTool = vi.fn(() => undefined);
			const afterTool = vi.fn(() => undefined);

			const { agent } = await AgentBuilder.create("advanced_cfg")
				.withModel("gemini-2.5-flash")
				.withInputSchema(z.object({ q: z.string() }))
				.withPlanner(planner)
				.withCodeExecutor(codeExecutor)
				.withOutputKey("answer")
				.withSubAgents([sub])
				.withBeforeAgentCallback(beforeAgent)
				.withAfterAgentCallback(afterAgent)
				.withBeforeModelCallback(beforeModel)
				.withAfterModelCallback(afterModel)
				.withBeforeToolCallback(beforeTool)
				.withAfterToolCallback(afterTool)
				.build();

			expect(agent).toBeInstanceOf(LlmAgent);
			const llm = agent as LlmAgent;
			expect(llm.planner).toBe(planner);
			expect(llm.codeExecutor).toBe(codeExecutor);
			expect(llm.outputKey).toBe("answer");
			expect(llm.subAgents).toEqual([sub]);
			expect(llm.beforeAgentCallback).toBe(beforeAgent);
			expect(llm.afterAgentCallback).toBe(afterAgent);
			expect(llm.beforeModelCallback).toBe(beforeModel);
			expect(llm.afterModelCallback).toBe(afterModel);
			expect(llm.beforeToolCallback).toBe(beforeTool);
			expect(llm.afterToolCallback).toBe(afterTool);
		});

		it("applies plugins, runConfig, and eventsCompaction configuration", async () => {
			const plugin = new StubPlugin();
			const builder = AgentBuilder.create("plugin_cfg")
				.withModel("gemini-2.5-flash")
				.withPlugins(plugin)
				.withRunConfig(new RunConfig({ streamingMode: StreamingMode.SSE }))
				.withEventsCompaction({
					compactionInterval: 5,
					overlapSize: 1,
				});

			const { agent, runner } = await builder.build();
			expect((agent as LlmAgent).plugins).toEqual([plugin]);
			expect(runner.ask).toBeInstanceOf(Function);
			expect((builder as any).eventsCompactionConfig).toEqual({
				compactionInterval: 5,
				overlapSize: 1,
			});
			expect((builder as any).runConfig).toBeInstanceOf(RunConfig);
			expect((builder as any).runConfig.streamingMode).toBe(StreamingMode.SSE);
		});

		it("throws when outputSchema is set on sequential aggregators", () => {
			const sub = new LlmAgent({
				name: "seq_child",
				model: "gemini-2.5-flash",
			});
			expect(() =>
				AgentBuilder.create("seq_schema")
					.asSequential([sub])
					.withOutputSchema(z.object({ ok: z.boolean() })),
			).toThrow(/cannot be applied to sequential or parallel/);
		});

		it("ignores outputKey on parallel aggregators", async () => {
			const sub = new LlmAgent({
				name: "par_child",
				model: "gemini-2.5-flash",
			});
			const { agent } = await AgentBuilder.create("par_out")
				.asParallel([sub])
				.withOutputKey("ignored")
				.build();

			expect(agent).toBeInstanceOf(ParallelAgent);
			expect((agent as any).outputKey).toBeUndefined();
		});

		it("locks definition after withAgent and ignores later mutations", async () => {
			const existing = new LlmAgent({
				name: "locked_agent",
				model: "gemini-2.5-flash",
			});
			const { agent } = await AgentBuilder.withAgent(existing)
				.withModel("gpt-4o")
				.withDescription("ignored")
				.asSequential([])
				.build();

			expect(agent).toBe(existing);
			expect((agent as LlmAgent).model).toBe("gemini-2.5-flash");
		});
	});

	describe("Offline deepen (post #56) — session, schema, enhanced ask", () => {
		beforeEach(() => {
			vi.restoreAllMocks();
		});

		it("applies withOutputSchema on llm agents and exposes it via buildWithSchema", async () => {
			const schema = z.object({ answer: z.string() });
			const builder = AgentBuilder.create("schema_agent")
				.withModel("gemini-2.5-flash")
				.withOutputSchema(schema);

			expect((builder as any).config.outputSchema).toBe(schema);

			const { runner } = await builder.buildWithSchema<{ answer: string }>();
			expect(runner.__outputSchema).toBe(schema);
		});

		it("throws when withOutputSchema is used on parallel aggregators", () => {
			const sub = new LlmAgent({
				name: "par_child_schema",
				model: "gemini-2.5-flash",
			});
			expect(() =>
				AgentBuilder.create("par_schema")
					.asParallel([sub])
					.withOutputSchema(z.object({ ok: z.boolean() })),
			).toThrow(/cannot be applied to sequential or parallel/);
		});

		it("renames default_agent when withAgent provides a named agent", async () => {
			const existing = new LlmAgent({
				name: "renamed_from_default",
				model: "gemini-2.5-flash",
			});
			const builder = AgentBuilder.create().withAgent(existing);
			expect((builder as any).config.name).toBe("renamed_from_default");
			const { agent } = await builder.build();
			expect(agent).toBe(existing);
		});

		it("asSequential strips prior outputKey and outputSchema with warnings", async () => {
			const sub = new LlmAgent({
				name: "seq_strip_child",
				model: "gemini-2.5-flash",
			});
			const schema = z.object({ x: z.number() });
			const builder = AgentBuilder.create("seq_strip")
				.withModel("gemini-2.5-flash")
				.withOutputKey("will_go")
				.withOutputSchema(schema);

			expect((builder as any).config.outputKey).toBe("will_go");
			expect((builder as any).config.outputSchema).toBe(schema);

			builder.asSequential([sub]);
			expect((builder as any).config.outputKey).toBeUndefined();
			expect((builder as any).config.outputSchema).toBeUndefined();
			expect((builder as any).agentType).toBe("sequential");

			const { agent } = await builder.build();
			expect(agent).toBeInstanceOf(SequentialAgent);
		});

		it("asParallel strips prior outputKey/outputSchema and ignores when locked", async () => {
			const sub = new LlmAgent({
				name: "par_strip_child",
				model: "gemini-2.5-flash",
			});
			const schema = z.object({ y: z.string() });
			const builder = AgentBuilder.create("par_strip")
				.withModel("gemini-2.5-flash")
				.withOutputKey("gone")
				.withOutputSchema(schema);

			builder.asParallel([sub]);
			expect((builder as any).config.outputKey).toBeUndefined();
			expect((builder as any).config.outputSchema).toBeUndefined();
			expect((builder as any).agentType).toBe("parallel");

			const locked = new LlmAgent({
				name: "locked_par",
				model: "gemini-2.5-flash",
			});
			const lockedBuilder = AgentBuilder.withAgent(locked).asParallel([sub]);
			expect((lockedBuilder as any).agentType).toBe("llm");
			expect((lockedBuilder as any).existingAgent).toBe(locked);
		});

		it("withSession requires a session service and reuses an existing session", async () => {
			expect(() =>
				AgentBuilder.create("needs_service")
					.withModel("gemini-2.5-flash")
					.withSession({
						id: "s1",
						userId: "u1",
						appName: "a1",
						state: {},
						events: [],
						lastUpdateTime: 0,
					} as any),
			).toThrow(/Session service must be configured/);

			const existing = await sessionService.createSession(
				"reuse-app",
				"reuse-user",
				{ seed: 1 },
				"reuse-session-id",
			);

			const { session, agent } = await AgentBuilder.create("reuse_session")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService)
				.withSession(existing)
				.build();

			expect(session).toBe(existing);
			expect(session.id).toBe("reuse-session-id");
			expect(session.userId).toBe("reuse-user");
			expect(agent).toBeInstanceOf(LlmAgent);
		});

		it("withRunConfig accepts Partial RunConfig and merges onto prior config", () => {
			const builder = AgentBuilder.create("run_cfg")
				.withModel("gemini-2.5-flash")
				.withRunConfig({ streamingMode: StreamingMode.SSE })
				.withRunConfig({ saveInputBlobsAsArtifacts: true });

			const cfg = (builder as any).runConfig as RunConfig;
			expect(cfg).toBeInstanceOf(RunConfig);
			expect(cfg.streamingMode).toBe(StreamingMode.SSE);
			expect(cfg.saveInputBlobsAsArtifacts).toBe(true);
		});

		it("AgentBuilder.ask delegates to the enhanced runner", async () => {
			mockRunnerEvents([
				new Event({
					author: "ask_builder",
					content: { parts: [{ text: "pong" }] },
				}),
			]);

			const text = await AgentBuilder.create("ask_builder")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService, {
					userId: "ask-user",
					appName: "ask-app",
				})
				.ask("ping");

			expect(text).toBe("pong");
		});

		it("enhanced ask concatenates parts, skips empty part lists, and trims", async () => {
			mockRunnerEvents([
				new Event({
					author: "concat_agent",
					content: {
						parts: [{ text: "Hel" }, { text: "lo" }, { inlineData: {} as any }],
					},
				}),
				new Event({
					author: "concat_agent",
					content: { parts: [{ text: "!" }] },
				}),
				new Event({ author: "concat_agent", content: { parts: [] } }),
				new Event({ author: "concat_agent" }),
			]);

			const { runner } = await AgentBuilder.create("concat_agent")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			await expect(runner.ask("hi")).resolves.toBe("Hello!");
		});

		it("enhanced ask accepts FullMessage and LlmRequest-shaped contents", async () => {
			mockRunnerEvents([
				new Event({
					author: "msg_shapes",
					content: { parts: [{ text: "ok" }] },
				}),
			]);

			const { runner } = await AgentBuilder.create("msg_shapes")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			await expect(runner.ask({ parts: [{ text: "full" }] })).resolves.toBe(
				"ok",
			);

			await expect(
				runner.ask({
					contents: [
						{ role: "user", parts: [{ text: "earlier" }] },
						{ role: "user", parts: [{ text: "latest" }] },
					],
				} as any),
			).resolves.toBe("ok");
		});

		it("enhanced ask throws when session userId is missing", async () => {
			const builderAny =
				AgentBuilder.create("no_user2").withModel("gemini-2.5-flash");
			(builderAny as any).sessionService = sessionService;
			(builderAny as any).sessionOptions = { appName: "a" };
			const session = await sessionService.createSession("a", "ghost", {});
			const enhanced = (builderAny as any).createEnhancedRunner(
				{
					runAsync: async function* () {},
					rewind: vi.fn(),
				},
				session,
			);

			await expect(enhanced.ask("x")).rejects.toThrow(
				/Session configuration is required/,
			);
		});

		it("enhanced ask returns per-sub-agent buffers for sequential/parallel", async () => {
			mockRunnerEvents([
				new Event({
					author: "user",
					content: { parts: [{ text: "prompt" }] },
				}),
				new Event({
					author: "alpha",
					content: { parts: [{ text: "A1" }] },
				}),
				new Event({
					author: "beta",
					content: { parts: [{ text: "B1" }] },
				}),
				new Event({
					author: "alpha",
					content: { parts: [{ text: "A2" }] },
				}),
				new Event({
					author: "other",
					content: { parts: [{ text: "ignored-for-map" }] },
				}),
			]);

			const alpha = new LlmAgent({
				name: "alpha",
				model: "gemini-2.5-flash",
			});
			const beta = new LlmAgent({
				name: "beta",
				model: "gemini-2.5-flash",
			});

			const { runner: seqRunner } = await AgentBuilder.create("multi_seq")
				.asSequential([alpha, beta])
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			await expect(seqRunner.ask("go")).resolves.toEqual([
				{ agent: "alpha", response: "A1A2" },
				{ agent: "beta", response: "B1" },
			]);

			mockRunnerEvents([
				new Event({
					author: "alpha",
					content: { parts: [{ text: " only-alpha " }] },
				}),
			]);

			const alpha2 = new LlmAgent({
				name: "alpha",
				model: "gemini-2.5-flash",
			});
			const beta2 = new LlmAgent({
				name: "beta",
				model: "gemini-2.5-flash",
			});

			const { runner: parRunner } = await AgentBuilder.create("multi_par")
				.asParallel([alpha2, beta2])
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			await expect(parRunner.ask("go")).resolves.toEqual([
				{ agent: "alpha", response: "only-alpha" },
				{ agent: "beta", response: "" },
			]);
		});

		it("enhanced ask parses JSON against outputSchema and falls back to raw parse", async () => {
			const schema = z.object({ answer: z.string() });

			mockRunnerEvents([
				new Event({
					author: "schema_ok",
					content: { parts: [{ text: '{"answer":"yes"}' }] },
				}),
			]);
			const { runner: okRunner } = await AgentBuilder.create("schema_ok")
				.withModel("gemini-2.5-flash")
				.withOutputSchema(schema)
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();
			await expect(okRunner.ask("q")).resolves.toEqual({ answer: "yes" });

			mockRunnerEvents([
				new Event({
					author: "schema_raw",
					content: { parts: [{ text: "not-json" }] },
				}),
			]);
			const stringSchema = z.string().min(3);
			const { runner: rawRunner } = await AgentBuilder.create("schema_raw")
				.withModel("gemini-2.5-flash")
				.withOutputSchema(stringSchema)
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();
			await expect(rawRunner.ask("q")).resolves.toBe("not-json");

			mockRunnerEvents([
				new Event({
					author: "schema_fail",
					content: { parts: [{ text: "nope" }] },
				}),
			]);
			const { runner: failRunner } = await AgentBuilder.create("schema_fail")
				.withModel("gemini-2.5-flash")
				.withOutputSchema(schema)
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();
			await expect(failRunner.ask("q")).rejects.toThrow(
				/Failed to parse and validate LLM output/,
			);
		});

		it("enhanced runAsync forwards default runConfig and rewind delegates", async () => {
			const runAsync = vi.fn(async function* () {
				yield new Event({
					author: "rw",
					content: { parts: [{ text: "x" }] },
				});
			});
			const rewind = vi.fn(async () => undefined);
			vi.spyOn(Runner.prototype, "runAsync").mockImplementation(
				runAsync as any,
			);
			vi.spyOn(Runner.prototype, "rewind").mockImplementation(rewind as any);

			const { runner, session } = await AgentBuilder.create("rw_agent")
				.withModel("gemini-2.5-flash")
				.withRunConfig({ streamingMode: StreamingMode.BIDI })
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			const events = [];
			for await (const e of runner.runAsync({
				userId: session.userId,
				sessionId: session.id,
				newMessage: { parts: [{ text: "hi" }] },
			})) {
				events.push(e);
			}
			expect(events).toHaveLength(1);
			expect(runAsync).toHaveBeenCalledWith(
				expect.objectContaining({
					runConfig: expect.objectContaining({
						streamingMode: StreamingMode.BIDI,
					}),
				}),
			);

			await runner.rewind({
				userId: session.userId,
				sessionId: session.id,
				rewindBeforeInvocationId: "inv-1",
			});
			expect(rewind).toHaveBeenCalledWith({
				userId: session.userId,
				sessionId: session.id,
				rewindBeforeInvocationId: "inv-1",
			});
		});

		it("withAgent static factory falls back when agent name is empty", async () => {
			const nameless = new LlmAgent({
				name: "temp",
				model: "gemini-2.5-flash",
			});
			(nameless as any).name = "";
			const builder = AgentBuilder.withAgent(nameless);
			expect((builder as any).config.name).toBe("default_agent");
			const { agent } = await builder.build();
			expect(agent).toBe(nameless);
		});

		it("loop createAgent falls back to maxIterations 3 when set to 0", async () => {
			const child = new LlmAgent({
				name: "loop_child",
				model: "gemini-2.5-flash",
			});
			const builder = AgentBuilder.create("loop_zero").asLoop([child], 0);
			expect((builder as any).config.maxIterations).toBe(0);
			const { agent } = await builder.build();
			expect(agent).toBeInstanceOf(LoopAgent);
			expect((agent as LoopAgent).maxIterations).toBe(3);
		});

		it("enhanced ask treats nullish parts as empty text and stringifies non-Error validation failures", async () => {
			mockRunnerEvents([
				new Event({
					author: "null_parts",
					content: { parts: [null as any, { text: "keep" }] },
				}),
			]);
			const { runner } = await AgentBuilder.create("null_parts")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();
			await expect(runner.ask("x")).resolves.toBe("keep");

			mockRunnerEvents([
				new Event({
					author: "schema_throw",
					content: { parts: [{ text: '{"answer":1}' }] },
				}),
			]);
			const throwingSchema = {
				parse: () => {
					throw "zod-string-error";
				},
			} as any;
			const { runner: badRunner } = await AgentBuilder.create("schema_throw")
				.withModel("gemini-2.5-flash")
				.withOutputSchema(throwingSchema)
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();
			await expect(badRunner.ask("q")).rejects.toThrow(/zod-string-error/);
		});
	});

	describe("Leftover deepen (post #90/#91) — lock warns, ask edges, createAgent", () => {
		beforeEach(() => {
			vi.restoreAllMocks();
		});

		it("warnIfLocked warns for mutators but still mutates config while build returns existingAgent", async () => {
			const existing = new LlmAgent({
				name: "lock_keep",
				model: "gemini-2.5-flash",
			});
			const builder = AgentBuilder.withAgent(existing);
			const warn = vi.spyOn((builder as any).logger, "warn");

			const tool = createTool({
				name: "lock_probe_tool",
				description: "Probe tool for locked builder mutations",
				fn: () => ({}),
			});
			const planner = new BuiltInPlanner({
				thinkingConfig: { includeThoughts: true },
			} as any);
			const codeExecutor = new StubCodeExecutor();
			const beforeAgent = vi.fn();
			const afterAgent = vi.fn();
			const beforeModel = vi.fn();
			const afterModel = vi.fn();
			const beforeTool = vi.fn();
			const afterTool = vi.fn();
			const plugin = new StubPlugin();
			const schema = z.object({ n: z.number() });

			builder
				.withInstruction("ignored-instruction")
				.withInputSchema(schema)
				.withOutputSchema(schema)
				.withTools(tool)
				.withPlanner(planner)
				.withCodeExecutor(codeExecutor)
				.withOutputKey("ignored-key")
				.withSubAgents([
					new LlmAgent({ name: "child", model: "gemini-2.5-flash" }),
				])
				.withBeforeAgentCallback(beforeAgent)
				.withAfterAgentCallback(afterAgent)
				.withBeforeModelCallback(beforeModel)
				.withAfterModelCallback(afterModel)
				.withBeforeToolCallback(beforeTool)
				.withAfterToolCallback(afterTool)
				.withPlugins(plugin)
				.asLoop([new LlmAgent({ name: "loop", model: "gemini-2.5-flash" })], 9)
				.asLangGraph(
					[
						{
							name: "n1",
							agent: new LlmAgent({ name: "g", model: "gemini-2.5-flash" }),
						},
					],
					"n1",
				);

			expect(warn.mock.calls.length).toBeGreaterThanOrEqual(16);
			expect(
				warn.mock.calls.some((c) => String(c[0]).includes("withTools")),
			).toBe(true);
			expect(warn.mock.calls.some((c) => String(c[0]).includes("asLoop"))).toBe(
				true,
			);
			expect(
				warn.mock.calls.some((c) => String(c[0]).includes("asLangGraph")),
			).toBe(true);
			expect((builder as any).config.instruction).toBe("ignored-instruction");
			expect((builder as any).config.tools).toEqual([tool]);
			expect((builder as any).agentType).toBe("langgraph");
			expect((builder as any).config.maxIterations).toBe(9);

			const { agent } = await builder.build();
			expect(agent).toBe(existing);
		});

		it("locked asSequential and asParallel warn and early-return without flipping agentType", async () => {
			const existing = new LlmAgent({
				name: "lock_agg",
				model: "gemini-2.5-flash",
			});
			const builder = AgentBuilder.withAgent(existing);
			const warn = vi.spyOn((builder as any).logger, "warn");
			const child = new LlmAgent({
				name: "agg_child",
				model: "gemini-2.5-flash",
			});

			builder.asSequential([child]);
			expect((builder as any).agentType).toBe("llm");
			expect(
				warn.mock.calls.some((c) => String(c[0]).includes("asSequential")),
			).toBe(true);

			builder.asParallel([child]);
			expect((builder as any).agentType).toBe("llm");
			expect(
				warn.mock.calls.some((c) => String(c[0]).includes("asParallel")),
			).toBe(true);

			const { agent } = await builder.build();
			expect(agent).toBe(existing);
		});

		it("withOutputKey after asSequential warns and does not write outputKey", async () => {
			const child = new LlmAgent({
				name: "seq_out_child",
				model: "gemini-2.5-flash",
			});
			const builder = AgentBuilder.create("seq_out").asSequential([child]);
			const warn = vi.spyOn((builder as any).logger, "warn");

			builder.withOutputKey("should_ignore");
			expect((builder as any).config.outputKey).toBeUndefined();
			expect(warn).toHaveBeenCalledWith(
				"AgentBuilder: outputKey ignored for sequential/parallel aggregator",
				expect.objectContaining({
					context: expect.objectContaining({
						attemptedOutputKey: "should_ignore",
						agentType: "sequential",
					}),
				}),
			);
		});

		it("withSessionService forwards custom state and sessionId to createSession", async () => {
			const createSession = vi.spyOn(sessionService, "createSession");
			const { session } = await AgentBuilder.create("custom_session")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService, {
					userId: "uid-custom",
					appName: "app-custom",
					state: { seed: 42 },
					sessionId: "sess-custom",
				})
				.build();

			expect(createSession).toHaveBeenCalledWith(
				"app-custom",
				"uid-custom",
				{ seed: 42 },
				"sess-custom",
			);
			expect(session.id).toBe("sess-custom");
			expect(session.state.seed).toBe(42);
		});

		it("enhanced runAsync prefers caller runConfig over builder default", async () => {
			const runSpy = vi
				.spyOn(Runner.prototype, "runAsync")
				.mockImplementation(async function* () {});
			vi.spyOn(Runner.prototype, "rewind").mockResolvedValue(
				undefined as never,
			);

			const builderDefault = new RunConfig({
				streamingMode: StreamingMode.SSE,
			});
			const callerOverride = new RunConfig({
				streamingMode: StreamingMode.BIDI,
			});
			const { runner, session } = await AgentBuilder.create("run_override")
				.withModel("gemini-2.5-flash")
				.withRunConfig(builderDefault)
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			const iter = runner.runAsync({
				userId: "u",
				sessionId: session.id,
				newMessage: { parts: [{ text: "hi" }] },
				runConfig: callerOverride,
			});
			for await (const _ of iter) {
				/* drain */
			}

			expect(runSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					runConfig: callerOverride,
				}),
			);
		});

		it("enhanced ask skips empty author, missing content, and non-text-only parts", async () => {
			mockRunnerEvents([
				new Event({
					author: "",
					content: { parts: [{ text: "from-empty-author" }] },
				}),
				new Event({ author: "agent_a" } as any),
				new Event({
					author: "agent_a",
					content: {
						parts: [{ inlineData: { data: "x", mimeType: "t" } } as any],
					},
				}),
				new Event({
					author: "agent_a",
					content: { parts: [{ text: "   " }] },
				}),
				new Event({
					author: "user",
					content: { parts: [{ text: "user-text" }] },
				}),
				new Event({
					author: "agent_a",
					content: { parts: [{ text: "keep" }] },
				}),
			]);

			const { runner } = await AgentBuilder.create("ask_filter")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			await expect(runner.ask("q")).resolves.toBe(
				"from-empty-author   user-textkeep",
			);
		});

		it("createAgent uses empty description fallbacks for aggregator and langgraph types", async () => {
			const seqChild = new LlmAgent({
				name: "desc_seq_child",
				model: "gemini-2.5-flash",
			});
			const parChild = new LlmAgent({
				name: "desc_par_child",
				model: "gemini-2.5-flash",
			});
			const loopChild = new LlmAgent({
				name: "desc_loop_child",
				model: "gemini-2.5-flash",
			});

			const sequential = await AgentBuilder.create("seq_nodesc")
				.asSequential([seqChild])
				.build();
			expect(sequential.agent.description).toBe("");

			const parallel = await AgentBuilder.create("par_nodesc")
				.asParallel([parChild])
				.build();
			expect(parallel.agent.description).toBe("");

			const loop = await AgentBuilder.create("loop_nodesc")
				.asLoop([loopChild], 2)
				.build();
			expect(loop.agent.description).toBe("");

			const graphChild = new LlmAgent({
				name: "graph_child",
				model: "gemini-2.5-flash",
			});
			const langgraph = await AgentBuilder.create("lg_nodesc")
				.asLangGraph([{ name: "root", agent: graphChild }], "root")
				.build();
			expect(langgraph.agent).toBeInstanceOf(LangGraphAgent);
			expect(langgraph.agent.description).toBe("");
		});

		it("static withModel accepts BaseLlm-shaped and LanguageModel-shaped values", async () => {
			const fakeLlm = {
				model: "fake-llm",
				generateContentAsync: async function* () {},
			} as any;
			const builderFromLlm = AgentBuilder.withModel(fakeLlm);
			expect((builderFromLlm as any).config.model).toBe(fakeLlm);

			const fakeLanguageModel = {
				specificationVersion: "v2",
				provider: "test",
				modelId: "lang-model",
			} as any;
			const builderFromLm = AgentBuilder.withModel(fakeLanguageModel);
			expect((builderFromLm as any).config.model).toBe(fakeLanguageModel);

			const { agent } = await builderFromLlm
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();
			expect(agent).toBeInstanceOf(LlmAgent);
			expect((agent as LlmAgent).model).toBe(fakeLlm);
		});

		it("wires memory, artifact, plugins, and eventsCompaction onto builder and LlmAgent", async () => {
			const compaction = {
				compactionInterval: 5,
				overlapSize: 1,
			};
			const plugin = new StubPlugin();
			const builder = AgentBuilder.create("wired")
				.withModel("gemini-2.5-flash")
				.withMemory(memoryService)
				.withArtifactService(artifactService)
				.withPlugins(plugin)
				.withEventsCompaction(compaction as any)
				.withSessionService(sessionService, {
					userId: "u",
					appName: "wired-app",
				});

			expect((builder as any).memoryService).toBe(memoryService);
			expect((builder as any).artifactService).toBe(artifactService);
			expect((builder as any).eventsCompactionConfig).toEqual(compaction);
			expect((builder as any).config.plugins).toEqual([plugin]);

			const {
				agent,
				runner,
				session,
				sessionService: svc,
			} = await builder.build();

			expect(agent).toBeInstanceOf(LlmAgent);
			expect(svc).toBe(sessionService);
			expect(session.appName).toBe("wired-app");
			expect(typeof runner.ask).toBe("function");
			expect((agent as LlmAgent).memoryService).toBe(memoryService);
			expect((agent as LlmAgent).artifactService).toBe(artifactService);
		});

		it("enhanced ask multi-agent ignores empty author buffers and trims per agent", async () => {
			const a = new LlmAgent({ name: "alpha", model: "gemini-2.5-flash" });
			const b = new LlmAgent({ name: "beta", model: "gemini-2.5-flash" });
			mockRunnerEvents([
				new Event({
					author: "",
					content: { parts: [{ text: "orphan" }] },
				}),
				new Event({
					author: "alpha",
					content: { parts: [{ text: "  hi " }] },
				}),
				new Event({
					author: "beta",
					content: { parts: [{ text: " there  " }] },
				}),
			]);

			const { runner } = await AgentBuilder.create("multi_trim")
				.asSequential([a, b])
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			await expect(runner.ask("q")).resolves.toEqual([
				{ agent: "alpha", response: "hi" },
				{ agent: "beta", response: "there" },
			]);
		});

		it("withOutputKey warns after asParallel and sequential createAgent requires non-empty subAgents", async () => {
			const child = new LlmAgent({
				name: "par_warn_child",
				model: "gemini-2.5-flash",
			});
			const builder = AgentBuilder.create("par_warn").asParallel([child]);
			const warn = vi.spyOn((builder as any).logger, "warn");
			builder.withOutputKey("nope");
			expect(warn.mock.calls[0][0]).toContain(
				"outputKey ignored for sequential/parallel aggregator",
			);
			expect((builder as any).config.outputKey).toBeUndefined();

			await expect(
				AgentBuilder.create("seq_empty")
					.asSequential([] as any)
					.build(),
			).rejects.toThrow(/Sub-agents required for sequential/);
		});
	});
});

function mockRunnerEvents(events: Event[]) {
	vi.spyOn(Runner.prototype, "runAsync").mockImplementation(async function* () {
		for (const event of events) {
			yield event;
		}
	});
	vi.spyOn(Runner.prototype, "rewind").mockResolvedValue(undefined as never);
}
