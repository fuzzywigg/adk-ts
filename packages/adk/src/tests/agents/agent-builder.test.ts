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
import { Logger } from "../../logger/index.js";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service.js";
import { BaseLlm } from "../../models/base-llm.js";
import type { LlmRequest } from "../../models/llm-request.js";
import type { LlmResponse } from "../../models/llm-response.js";
import { BuiltInPlanner } from "../../planners/built-in-planner.js";
import { BasePlugin } from "../../plugins/base-plugin.js";
import { Runner } from "../../runners.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";
import { createTool } from "../../tools/base/create-tool.js";

class StubLlm extends BaseLlm {
	constructor(model = "stub-llm") {
		super(model);
	}

	async *generateContentAsync(
		_llmRequest: LlmRequest,
		_stream?: boolean,
	): AsyncGenerator<LlmResponse, void, unknown> {
		yield { content: { parts: [{ text: "stub" }] } } as LlmResponse;
	}
}

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

	describe("TOKENMAXX deepen — lock, wiring, LangGraph, ask edges", () => {
		let warnSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			vi.restoreAllMocks();
			warnSpy = vi
				.spyOn(Logger.prototype, "warn")
				.mockImplementation(() => undefined);
		});

		it("warnIfLocked logs for definition mutators after withAgent", async () => {
			const existing = new LlmAgent({
				name: "locked_warn",
				model: "gemini-2.5-flash",
			});
			const tool = createTool({
				name: "t",
				description: "locked tool helper",
				fn: () => "ok",
			});
			const plugin = new StubPlugin();
			const planner = new BuiltInPlanner({
				thinkingConfig: { includeThoughts: false },
			});
			const codeExecutor = new StubCodeExecutor();
			const beforeAgent = vi.fn(() => undefined);
			const afterAgent = vi.fn(() => undefined);
			const beforeModel = vi.fn(() => undefined);
			const afterModel = vi.fn(() => undefined);
			const beforeTool = vi.fn(() => undefined);
			const afterTool = vi.fn(() => undefined);

			AgentBuilder.withAgent(existing)
				.withModel("gpt-4o")
				.withDescription("ignored-desc")
				.withInstruction("ignored-instr")
				.withInputSchema(z.object({ a: z.string() }))
				.withOutputSchema(z.object({ b: z.string() }))
				.withTools(tool)
				.withPlanner(planner)
				.withCodeExecutor(codeExecutor)
				.withOutputKey("ignored-key")
				.withSubAgents([])
				.withBeforeAgentCallback(beforeAgent)
				.withAfterAgentCallback(afterAgent)
				.withBeforeModelCallback(beforeModel)
				.withAfterModelCallback(afterModel)
				.withBeforeToolCallback(beforeTool)
				.withAfterToolCallback(afterTool)
				.withPlugins(plugin);

			const warnedMethods = warnSpy.mock.calls
				.map((c) => String(c[0]))
				.filter((msg) => msg.includes("ignored because builder is locked"));
			expect(warnedMethods.length).toBeGreaterThanOrEqual(15);
			for (const method of [
				"withModel",
				"withDescription",
				"withInstruction",
				"withInputSchema",
				"withOutputSchema",
				"withTools",
				"withPlanner",
				"withCodeExecutor",
				"withOutputKey",
				"withSubAgents",
				"withBeforeAgentCallback",
				"withAfterAgentCallback",
				"withBeforeModelCallback",
				"withAfterModelCallback",
				"withBeforeToolCallback",
				"withAfterToolCallback",
				"withPlugins",
			]) {
				expect(warnedMethods.some((m) => m.includes(`${method}()`))).toBe(true);
			}

			const { agent } = await AgentBuilder.withAgent(existing).build();
			expect(agent).toBe(existing);
		});

		it("asSequential and asParallel warn and early-return when locked", async () => {
			const existing = new LlmAgent({
				name: "locked_agg",
				model: "gemini-2.5-flash",
			});
			const sub = new LlmAgent({
				name: "child",
				model: "gemini-2.5-flash",
			});
			const seqBuilder = AgentBuilder.withAgent(existing).asSequential([sub]);
			expect((seqBuilder as any).agentType).toBe("llm");
			expect((seqBuilder as any).existingAgent).toBe(existing);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("asSequential() ignored"),
				expect.objectContaining({
					suggestion: "Call asSequential() before withAgent().",
				}),
			);

			warnSpy.mockClear();
			const parBuilder = AgentBuilder.withAgent(existing).asParallel([sub]);
			expect((parBuilder as any).agentType).toBe("llm");
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("asParallel() ignored"),
				expect.objectContaining({
					suggestion: "Call asParallel() before withAgent().",
				}),
			);

			const { agent } = await seqBuilder.build();
			expect(agent).toBe(existing);
		});

		it("asLoop and asLangGraph warn when locked but still mutate agentType", () => {
			const existing = new LlmAgent({
				name: "locked_loop_lg",
				model: "gemini-2.5-flash",
			});
			const sub = new LlmAgent({
				name: "loop_child",
				model: "gemini-2.5-flash",
			});
			const nodes = [{ name: "n1", agent: sub, targets: [] }];

			const loopBuilder = AgentBuilder.withAgent(existing).asLoop([sub], 7);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("asLoop() ignored because builder is locked"),
				expect.any(Object),
			);
			expect((loopBuilder as any).agentType).toBe("loop");
			expect((loopBuilder as any).config.maxIterations).toBe(7);

			warnSpy.mockClear();
			const lgBuilder = AgentBuilder.withAgent(existing).asLangGraph(
				nodes,
				"n1",
			);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					"asLangGraph() ignored because builder is locked",
				),
				expect.any(Object),
			);
			expect((lgBuilder as any).agentType).toBe("langgraph");
			expect((lgBuilder as any).config.rootNode).toBe("n1");
			expect((lgBuilder as any).config.nodes).toEqual(nodes);
		});

		it("withOutputKey is ignored on sequential aggregators with a warning", async () => {
			const sub = new LlmAgent({
				name: "seq_out_child",
				model: "gemini-2.5-flash",
			});
			const { agent } = await AgentBuilder.create("seq_out")
				.asSequential([sub])
				.withOutputKey("ignored-seq")
				.build();

			expect(agent).toBeInstanceOf(SequentialAgent);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					"outputKey ignored for sequential/parallel aggregator",
				),
				expect.objectContaining({
					context: expect.objectContaining({
						attemptedOutputKey: "ignored-seq",
						agentType: "sequential",
					}),
				}),
			);
		});

		it("asSequential strips outputKey alone; asParallel strips outputSchema alone", () => {
			const sub = new LlmAgent({
				name: "strip_child",
				model: "gemini-2.5-flash",
			});
			const seq = AgentBuilder.create("seq_key_only")
				.withModel("gemini-2.5-flash")
				.withOutputKey("only-key");
			seq.asSequential([sub]);
			expect((seq as any).config.outputKey).toBeUndefined();
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					"outputKey ignored for sequential agent aggregator; removed",
				),
				expect.objectContaining({
					context: { previousValue: "only-key" },
				}),
			);

			warnSpy.mockClear();
			const schema = z.object({ v: z.number() });
			const par = AgentBuilder.create("par_schema_only")
				.withModel("gemini-2.5-flash")
				.withOutputSchema(schema);
			par.asParallel([sub]);
			expect((par as any).config.outputSchema).toBeUndefined();
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					"outputSchema cannot be applied to parallel aggregator; removed",
				),
				expect.any(Object),
			);
		});

		it("withPlugins and withTools accumulate across repeated calls", async () => {
			const t1 = createTool({
				name: "t1",
				description: "first accumulated tool",
				fn: () => 1,
			});
			const t2 = createTool({
				name: "t2",
				description: "second accumulated tool",
				fn: () => 2,
			});
			const p1 = new StubPlugin();
			const p2 = new (class extends BasePlugin {
				constructor() {
					super("stub-plugin-2");
				}
			})();

			const { agent } = await AgentBuilder.create("accumulate")
				.withModel("gemini-2.5-flash")
				.withTools(t1)
				.withTools(t2)
				.withPlugins(p1)
				.withPlugins(p2)
				.build();

			const llm = agent as LlmAgent;
			expect(llm.tools.map((t: any) => t.name)).toEqual(["t1", "t2"]);
			expect(llm.plugins).toEqual([p1, p2]);
		});

		it("withInputSchema and withOutputSchema are applied on built LlmAgent", async () => {
			const input = z.object({ q: z.string() });
			const output = z.object({ a: z.string() });
			const { agent } = await AgentBuilder.create("schemas_on_agent")
				.withModel("gemini-2.5-flash")
				.withInputSchema(input)
				.withOutputSchema(output)
				.build();

			const llm = agent as LlmAgent;
			expect(llm.inputSchema).toBe(input);
			expect(llm.outputSchema).toBe(output);
		});

		it("withModel forwards BaseLlm instances unchanged onto LlmAgent", async () => {
			const stub = new StubLlm("custom-stub");
			const { agent } = await AgentBuilder.create("base_llm_model")
				.withModel(stub)
				.build();
			expect((agent as LlmAgent).model).toBe(stub);
		});

		it("withAgent keeps a non-default builder name", async () => {
			const existing = new LlmAgent({
				name: "agent_name",
				model: "gemini-2.5-flash",
			});
			const builder = AgentBuilder.create("custom_builder_name").withAgent(
				existing,
			);
			expect((builder as any).config.name).toBe("custom_builder_name");
			const { agent } = await builder.build();
			expect(agent).toBe(existing);
		});

		it("aggregator agents default missing description to empty string", async () => {
			const { agent: seq } = await AgentBuilder.create("seq_no_desc")
				.asSequential([
					new LlmAgent({ name: "seq_child_desc", model: "gemini-2.5-flash" }),
				])
				.build();
			expect(seq.description).toBe("");

			const { agent: par } = await AgentBuilder.create("par_no_desc")
				.asParallel([
					new LlmAgent({ name: "par_child_desc", model: "gemini-2.5-flash" }),
				])
				.build();
			expect(par.description).toBe("");

			const { agent: loop } = await AgentBuilder.create("loop_no_desc")
				.asLoop(
					[
						new LlmAgent({
							name: "loop_child_desc",
							model: "gemini-2.5-flash",
						}),
					],
					2,
				)
				.build();
			expect(loop.description).toBe("");

			const lgChild = new LlmAgent({
				name: "lg_child_desc",
				model: "gemini-2.5-flash",
			});
			const { agent: lg } = await AgentBuilder.create("lg_no_desc")
				.asLangGraph([{ name: "root", agent: lgChild, targets: [] }], "root")
				.build();
			expect(lg.description).toBe("");
		});

		it("asLoop applies custom maxIterations; asLangGraph passes nodes and rootNode", async () => {
			const child = new LlmAgent({
				name: "loop_custom",
				model: "gemini-2.5-flash",
			});
			const { agent: loop } = await AgentBuilder.create("loop_custom_iters")
				.asLoop([child], 9)
				.build();
			expect(loop).toBeInstanceOf(LoopAgent);
			expect((loop as LoopAgent).maxIterations).toBe(9);

			const nodes = [
				{ name: "start", agent: child, targets: ["end"] },
				{ name: "end", agent: child, targets: [] },
			];
			const { agent: lg } = await AgentBuilder.create("lg_nodes")
				.asLangGraph(nodes, "start")
				.build();
			expect(lg).toBeInstanceOf(LangGraphAgent);
			expect((lg as LangGraphAgent).getRootNodeName()).toBe("start");
			expect((lg as LangGraphAgent).getNodes().map((n) => n.name)).toEqual([
				"start",
				"end",
			]);
		});

		it("createAgent langgraph throws when rootNode is cleared after asLangGraph", async () => {
			const child = new LlmAgent({
				name: "lg_missing_root",
				model: "gemini-2.5-flash",
			});
			const builder = AgentBuilder.create("lg_bad_root").asLangGraph(
				[{ name: "n", agent: child, targets: [] }],
				"n",
			);
			(builder as any).config.rootNode = undefined;
			await expect(builder.build()).rejects.toThrow(
				/Nodes and root node required for LangGraph agent/,
			);
		});

		it("withSessionService forwards state and sessionId into createSession", async () => {
			const createSession = vi.spyOn(sessionService, "createSession");
			const { session } = await AgentBuilder.create("session_opts")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService, {
					userId: "u-opts",
					appName: "a-opts",
					state: { seeded: true },
					sessionId: "fixed-session-id",
				})
				.build();

			expect(createSession).toHaveBeenCalledWith(
				"a-opts",
				"u-opts",
				{ seeded: true },
				"fixed-session-id",
			);
			expect(session.id).toBe("fixed-session-id");
			expect(session.state).toEqual({ seeded: true });
		});

		it("withSession copies state onto sessionOptions", async () => {
			const existing = await sessionService.createSession(
				"copy-app",
				"copy-user",
				{ fromSession: 42 },
				"copy-id",
			);
			const builder = AgentBuilder.create("copy_state")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService)
				.withSession(existing);

			expect((builder as any).sessionOptions).toEqual(
				expect.objectContaining({
					userId: "copy-user",
					appName: "copy-app",
					sessionId: "copy-id",
					state: { fromSession: 42 },
				}),
			);
		});

		it("withQuickSession uses InMemorySessionService and generated ids", async () => {
			const { session, sessionService: svc } = await AgentBuilder.create(
				"quick_ids",
			)
				.withModel("gemini-2.5-flash")
				.withQuickSession()
				.build();

			expect(svc).toBeInstanceOf(InMemorySessionService);
			expect(session.appName).toBe("app-quick_ids");
			expect(session.userId).toMatch(/^user-quick_ids-/);
		});

		it("build forwards plugins, compaction, memory, and artifacts to Runner", async () => {
			const plugin = new StubPlugin();
			const compaction = {
				compactionInterval: 3,
				overlapSize: 1,
				summarizer: { name: "fake-summarizer" } as any,
			};
			let capturedRunner: Runner | undefined;
			const origRunAsync = Runner.prototype.runAsync;
			vi.spyOn(Runner.prototype, "runAsync").mockImplementation(function (
				this: Runner,
				params: any,
			) {
				capturedRunner = this;
				return origRunAsync.call(this, params);
			});

			const { runner, agent, session } = await AgentBuilder.create(
				"wire_runner",
			)
				.withModel("gemini-2.5-flash")
				.withMemory(memoryService)
				.withArtifactService(artifactService)
				.withPlugins(plugin)
				.withEventsCompaction(compaction)
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			expect((agent as LlmAgent).memoryService).toBe(memoryService);
			expect((agent as LlmAgent).artifactService).toBe(artifactService);
			expect((agent as LlmAgent).plugins).toEqual([plugin]);
			expect((agent as LlmAgent).sessionService).toBe(sessionService);

			for await (const _ of runner.runAsync({
				userId: session.userId,
				sessionId: session.id,
				newMessage: { parts: [{ text: "hi" }] },
			})) {
				/* drain */
			}

			expect(capturedRunner).toBeDefined();
			expect(capturedRunner!.memoryService).toBe(memoryService);
			expect(capturedRunner!.artifactService).toBe(artifactService);
			expect(capturedRunner!.eventsCompactionConfig).toEqual(compaction);
			expect((capturedRunner as any).pluginManager).toBeDefined();
		});

		it("withEventsCompaction last write wins on the builder", async () => {
			const first = { compactionInterval: 2, overlapSize: 0 };
			const second = {
				compactionInterval: 11,
				overlapSize: 4,
				summarizer: { id: "s2" } as any,
			};
			const builder = AgentBuilder.create("compaction_last")
				.withModel("gemini-2.5-flash")
				.withEventsCompaction(first)
				.withEventsCompaction(second);

			expect((builder as any).eventsCompactionConfig).toEqual(second);
			await builder.build();
			expect((builder as any).eventsCompactionConfig.summarizer).toEqual({
				id: "s2",
			});
		});

		it("withRunConfig Partial works with no prior RunConfig; RunConfig instance replaces", () => {
			const builder = AgentBuilder.create("run_partial")
				.withModel("gemini-2.5-flash")
				.withRunConfig({ streamingMode: StreamingMode.SSE });
			expect((builder as any).runConfig).toBeInstanceOf(RunConfig);
			expect((builder as any).runConfig.streamingMode).toBe(StreamingMode.SSE);

			const replacement = new RunConfig({
				streamingMode: StreamingMode.BIDI,
			});
			builder.withRunConfig(replacement);
			expect((builder as any).runConfig).toBe(replacement);
			expect((builder as any).runConfig.streamingMode).toBe(StreamingMode.BIDI);
		});

		it("runAsync prefers params.runConfig over builder withRunConfig", async () => {
			const runAsync = vi.fn(async function* () {
				yield new Event({
					author: "override",
					content: { parts: [{ text: "x" }] },
				});
			});
			vi.spyOn(Runner.prototype, "runAsync").mockImplementation(
				runAsync as any,
			);

			const { runner, session } = await AgentBuilder.create("override_rc")
				.withModel("gemini-2.5-flash")
				.withRunConfig({ streamingMode: StreamingMode.SSE })
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			const override = new RunConfig({ streamingMode: StreamingMode.BIDI });
			for await (const _ of runner.runAsync({
				userId: session.userId,
				sessionId: session.id,
				newMessage: { parts: [{ text: "hi" }] },
				runConfig: override,
			})) {
				/* drain */
			}

			expect(runAsync).toHaveBeenCalledWith(
				expect.objectContaining({ runConfig: override }),
			);
		});

		it("ask returns empty string when events have no text parts", async () => {
			mockRunnerEvents([
				new Event({
					author: "empty_text",
					content: { parts: [{ inlineData: {} as any }] },
				}),
				new Event({ author: "empty_text", content: { parts: [] } }),
			]);

			const { runner } = await AgentBuilder.create("empty_text")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			await expect(runner.ask("hi")).resolves.toBe("");
		});

		it("AgentBuilder.ask accepts FullMessage", async () => {
			mockRunnerEvents([
				new Event({
					author: "full_msg_builder",
					content: { parts: [{ text: "full-ok" }] },
				}),
			]);

			const text = await AgentBuilder.create("full_msg_builder")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.ask({ parts: [{ text: "full" }] });

			expect(text).toBe("full-ok");
		});

		it("ask schema failure embeds JSON parse and Zod validation Error messages", async () => {
			mockRunnerEvents([
				new Event({
					author: "schema_msgs",
					content: { parts: [{ text: "not-json" }] },
				}),
			]);
			const schema = z.object({ answer: z.string() });
			const { runner } = await AgentBuilder.create("schema_msgs")
				.withModel("gemini-2.5-flash")
				.withOutputSchema(schema)
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			await expect(runner.ask("q")).rejects.toThrow(
				/JSON parse error:[\s\S]*Zod validation error:/,
			);
		});

		it("multi ask ignores empty author and user author in per-agent buffers", async () => {
			mockRunnerEvents([
				new Event({
					author: "",
					content: { parts: [{ text: "no-author" }] },
				}),
				new Event({
					author: "user",
					content: { parts: [{ text: "user-text" }] },
				}),
				new Event({
					author: "alpha",
					content: { parts: [{ text: "A" }] },
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
			const { runner } = await AgentBuilder.create("multi_authors")
				.asSequential([alpha, beta])
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			await expect(runner.ask("go")).resolves.toEqual([
				{ agent: "alpha", response: "A" },
				{ agent: "beta", response: "" },
			]);
		});

		it("buildWithSchema returns the same BuiltAgent shape as build", async () => {
			const schema = z.object({ n: z.number() });
			const builder = AgentBuilder.create("parity")
				.withModel("gemini-2.5-flash")
				.withOutputSchema(schema)
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				});

			const a = await builder.build();
			const b = await builder.buildWithSchema<{ n: number }>();
			expect(b.agent).toBeInstanceOf(LlmAgent);
			expect(b.sessionService).toBe(sessionService);
			expect(b.runner.__outputSchema).toBe(schema);
			expect(a.runner.__outputSchema).toBe(schema);
			expect(typeof b.runner.ask).toBe("function");
			expect(typeof a.runner.ask).toBe("function");
		});

		it("static create default name drives app-/user- prefixes", async () => {
			const { session } = await AgentBuilder.create()
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService)
				.build();
			expect(session.appName).toBe("app-default_agent");
			expect(session.userId).toMatch(/^user-default_agent-/);
		});

		it("build wires memory/artifact/sessionService onto LlmAgent", async () => {
			const { agent } = await AgentBuilder.create("svc_wire")
				.withModel("gemini-2.5-flash")
				.withMemory(memoryService)
				.withArtifactService(artifactService)
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			const llm = agent as LlmAgent;
			expect(llm.memoryService).toBe(memoryService);
			expect(llm.artifactService).toBe(artifactService);
			expect(llm.sessionService).toBe(sessionService);
		});

		it("createAgent throws for non-array or empty subAgents on aggregators", async () => {
			const loop = AgentBuilder.create("bad_loop");
			(loop as any).agentType = "loop";
			(loop as any).config.subAgents = "not-array";
			await expect(loop.build()).rejects.toThrow(
				/Sub-agents required for loop agent/,
			);

			const seq = AgentBuilder.create("bad_seq");
			(seq as any).agentType = "sequential";
			(seq as any).config.subAgents = [];
			await expect(seq.build()).rejects.toThrow(
				/Sub-agents required for sequential agent/,
			);

			const par = AgentBuilder.create("bad_par");
			(par as any).agentType = "parallel";
			(par as any).config.subAgents = null;
			await expect(par.build()).rejects.toThrow(
				/Sub-agents required for parallel agent/,
			);
		});

		it("createAgent langgraph throws when nodes are empty or rootNode is not a string", async () => {
			const emptyNodes = AgentBuilder.create("lg_empty");
			(emptyNodes as any).agentType = "langgraph";
			(emptyNodes as any).config.nodes = [];
			(emptyNodes as any).config.rootNode = "x";
			await expect(emptyNodes.build()).rejects.toThrow(
				/Nodes and root node required for LangGraph agent/,
			);

			const badRoot = AgentBuilder.create("lg_bad_root_type");
			(badRoot as any).agentType = "langgraph";
			(badRoot as any).config.nodes = [
				{
					name: "n",
					agent: new LlmAgent({ name: "n", model: "gemini-2.5-flash" }),
					targets: [],
				},
			];
			(badRoot as any).config.rootNode = 123;
			await expect(badRoot.build()).rejects.toThrow(
				/Nodes and root node required for LangGraph agent/,
			);
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
