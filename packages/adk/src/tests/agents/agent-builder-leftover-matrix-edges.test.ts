import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { LangGraphAgent } from "../../agents/lang-graph-agent.js";
import { LlmAgent } from "../../agents/llm-agent.js";
import { LoopAgent } from "../../agents/loop-agent.js";
import { RunConfig, StreamingMode } from "../../agents/run-config.js";
import { Event } from "../../events/event.js";
import { Runner } from "../../runners.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";

function mockRunnerEvents(events: Event[]) {
	vi.spyOn(Runner.prototype, "runAsync").mockImplementation(async function* () {
		for (const event of events) {
			yield event;
		}
	});
	vi.spyOn(Runner.prototype, "rewind").mockResolvedValue(undefined as never);
}

function child(name: string) {
	return new LlmAgent({ name, model: "gemini-2.5-flash" });
}

describe("AgentBuilder leftover matrix edges (TOKENMAXX deepen)", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	describe('description || "" createAgent matrix for loop/langgraph', () => {
		it.each([
			{
				label: "loop omits description → empty",
				build: () => AgentBuilder.create("loop_desc").asLoop([child("c")]),
				ctor: LoopAgent,
			},
			{
				label: "langgraph omits description → empty",
				build: () =>
					AgentBuilder.create("lg_desc").asLangGraph(
						[{ name: "n", agent: child("n") }],
						"n",
					),
				ctor: LangGraphAgent,
			},
		])("$label", async ({ build, ctor }) => {
			const { agent } = await build().build();
			expect(agent).toBeInstanceOf(ctor);
			expect(agent.description).toBe("");
		});

		it.each([
			{
				label: "loop keeps explicit description",
				build: () =>
					AgentBuilder.create("loop_keep")
						.withDescription("loop-desc")
						.asLoop([child("c")]),
				expected: "loop-desc",
			},
			{
				label: "langgraph keeps explicit description",
				build: () =>
					AgentBuilder.create("lg_keep")
						.withDescription("lg-desc")
						.asLangGraph([{ name: "n", agent: child("n") }], "n"),
				expected: "lg-desc",
			},
			{
				label: "sequential keeps empty-string description (not rewritten)",
				build: () =>
					AgentBuilder.create("seq_empty")
						.withDescription("")
						.asSequential([child("c")]),
				expected: "",
			},
			{
				label: "parallel keeps empty-string description",
				build: () =>
					AgentBuilder.create("par_empty")
						.withDescription("")
						.asParallel([child("c")]),
				expected: "",
			},
		])("$label", async ({ build, expected }) => {
			const { agent } = await build().build();
			expect(agent.description).toBe(expected);
		});
	});

	describe("maxIterations || 3 coalesce matrix", () => {
		it.each([
			{ label: "undefined via forced config", value: undefined, expected: 3 },
			{ label: "null via forced config", value: null, expected: 3 },
			{ label: "0 via asLoop", value: 0, expected: 3 },
			{ label: "explicit 5", value: 5, expected: 5 },
			{ label: "explicit 1", value: 1, expected: 1 },
		])("$label → $expected", async ({ value, expected }) => {
			const builder = AgentBuilder.create("loop_iters").asLoop([child("c")]);
			(builder as any).config.maxIterations = value;
			const { agent } = await builder.build();
			expect((agent as LoopAgent).maxIterations).toBe(expected);
		});
	});

	describe("userId/appName || generateDefault* with falsy strings", () => {
		it.each([
			{
				label: "empty userId and appName fall back to generated defaults",
				options: { userId: "", appName: "" },
				expectApp: /^app-falsy_ids$/,
				expectUser: /^user-falsy_ids-/,
			},
			{
				label: "empty userId only keeps explicit appName",
				options: { userId: "", appName: "kept-app" },
				expectApp: /^kept-app$/,
				expectUser: /^user-falsy_ids-/,
			},
			{
				label: "empty appName only keeps explicit userId",
				options: { userId: "kept-user", appName: "" },
				expectApp: /^app-falsy_ids$/,
				expectUser: /^kept-user$/,
			},
		])("$label", async ({ options, expectApp, expectUser }) => {
			const createSession = vi.spyOn(sessionService, "createSession");
			const { session } = await AgentBuilder.create("falsy_ids")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService, options)
				.build();

			expect(createSession.mock.calls[0][0]).toMatch(expectApp);
			expect(createSession.mock.calls[0][1]).toMatch(expectUser);
			expect(session.appName).toMatch(expectApp);
			expect(session.userId).toMatch(expectUser);
		});
	});

	describe("withRunConfig merge with || {}", () => {
		it("creates RunConfig from Partial when prior runConfig is undefined", () => {
			const builder = AgentBuilder.create("rc_first")
				.withModel("gemini-2.5-flash")
				.withRunConfig({ streamingMode: StreamingMode.SSE });
			const rc = (builder as any).runConfig as RunConfig;
			expect(rc).toBeInstanceOf(RunConfig);
			expect(rc.streamingMode).toBe(StreamingMode.SSE);
		});

		it("merges Partial onto existing RunConfig via spread of prior || {}", () => {
			const builder = AgentBuilder.create("rc_merge")
				.withModel("gemini-2.5-flash")
				.withRunConfig({ streamingMode: StreamingMode.SSE })
				.withRunConfig({ saveInputBlobsAsArtifacts: true });
			const rc = (builder as any).runConfig as RunConfig;
			expect(rc.streamingMode).toBe(StreamingMode.SSE);
			expect(rc.saveInputBlobsAsArtifacts).toBe(true);
		});

		it("replaces with RunConfig instance without Partial merge", () => {
			const instance = new RunConfig({ streamingMode: StreamingMode.BIDI });
			const builder = AgentBuilder.create("rc_inst")
				.withModel("gemini-2.5-flash")
				.withRunConfig({ streamingMode: StreamingMode.SSE })
				.withRunConfig(instance);
			expect((builder as any).runConfig).toBe(instance);
		});
	});

	describe("enhanced ask author / perAgentBuffers / part.text coalesce", () => {
		it("skips authors that are falsy or reserved user when buffering multi responses", async () => {
			const alpha = child("alpha");
			const beta = child("beta");
			mockRunnerEvents([
				new Event({
					author: undefined as any,
					content: { parts: [{ text: "ghost" }] },
				}),
				new Event({
					author: "",
					content: { parts: [{ text: "blank-author" }] },
				}),
				new Event({
					author: "user",
					content: { parts: [{ text: "from-user" }] },
				}),
				new Event({
					author: "alpha",
					content: { parts: [{ text: "A1" }] },
				}),
				new Event({
					author: "alpha",
					content: { parts: [{ text: "A2" }] },
				}),
				new Event({
					author: "beta",
					content: { parts: [{ text: "B" }] },
				}),
			]);

			const { runner } = await AgentBuilder.create("author_buf")
				.asParallel([alpha, beta])
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			await expect(runner.ask("go")).resolves.toEqual([
				{ agent: "alpha", response: "A1A2" },
				{ agent: "beta", response: "B" },
			]);
		});

		it("coalesces missing agent buffers to empty string in multi map", async () => {
			const alpha = child("alpha");
			const beta = child("beta");
			mockRunnerEvents([
				new Event({
					author: "alpha",
					content: { parts: [{ text: "only-alpha" }] },
				}),
			]);

			const { runner } = await AgentBuilder.create("missing_buf")
				.asSequential([alpha, beta])
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			await expect(runner.ask("go")).resolves.toEqual([
				{ agent: "alpha", response: "only-alpha" },
				{ agent: "beta", response: "" },
			]);
		});

		it('joins part.text || "" for non-text and missing text parts', async () => {
			mockRunnerEvents([
				new Event({
					author: "parts",
					content: {
						parts: [
							{ text: "hi" },
							{ inlineData: { mimeType: "text/plain", data: "x" } } as any,
							{ text: undefined as any },
							{ text: null as any },
							{ text: "there" },
						],
					},
				}),
			]);

			const { runner } = await AgentBuilder.create("part_join")
				.withModel("gemini-2.5-flash")
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			await expect(runner.ask("q")).resolves.toBe("hithere");
		});

		it("stringifies both Error and non-Error failures in dual schema catch", async () => {
			mockRunnerEvents([
				new Event({
					author: "schema",
					content: { parts: [{ text: "not-json" }] },
				}),
			]);

			const schema = {
				parse: (value: unknown) => {
					if (typeof value === "string") {
						throw { code: "zod-object" };
					}
					throw new Error("json-path-error");
				},
			} as any;

			const { runner } = await AgentBuilder.create("dual_string")
				.withModel("gemini-2.5-flash")
				.withOutputSchema(schema)
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			await expect(runner.ask("q")).rejects.toThrow(/JSON parse error:/);
			await expect(runner.ask("q")).rejects.toThrow(/\[object Object\]/);
			await expect(runner.ask("q")).rejects.toThrow(/Zod validation error:/);
		});

		it("passes runConfig through ask → runAsync when configured", async () => {
			const spy = vi
				.spyOn(Runner.prototype, "runAsync")
				.mockImplementation(async function* () {
					yield new Event({
						author: "rc",
						content: { parts: [{ text: "ok" }] },
					});
				});

			const { runner } = await AgentBuilder.create("ask_rc")
				.withModel("gemini-2.5-flash")
				.withRunConfig({ streamingMode: StreamingMode.SSE })
				.withSessionService(sessionService, {
					userId: "u",
					appName: "a",
				})
				.build();

			await expect(runner.ask("hi")).resolves.toBe("ok");
			expect(spy.mock.calls[0][0].runConfig?.streamingMode).toBe(
				StreamingMode.SSE,
			);
		});
	});

	describe("createAgent throw matrix for empty/missing aggregators", () => {
		it.each([
			{
				label: "sequential empty array",
				setup: () => AgentBuilder.create("t_seq").asSequential([]),
				message: /Sub-agents required for sequential/,
			},
			{
				label: "parallel empty array",
				setup: () => AgentBuilder.create("t_par").asParallel([]),
				message: /Sub-agents required for parallel/,
			},
			{
				label: "loop empty array",
				setup: () => AgentBuilder.create("t_loop").asLoop([]),
				message: /Sub-agents required for loop/,
			},
			{
				label: "langgraph empty nodes",
				setup: () => AgentBuilder.create("t_lg").asLangGraph([], "root"),
				message: /Nodes and root node required for LangGraph/,
			},
			{
				label: "langgraph empty rootNode string",
				setup: () =>
					AgentBuilder.create("t_lg_root").asLangGraph(
						[{ name: "n", agent: child("n") }],
						"",
					),
				message: /Nodes and root node required for LangGraph/,
			},
		])("$label", async ({ setup, message }) => {
			await expect(setup().build()).rejects.toThrow(message);
		});

		it.each([
			{
				label: "sequential forced undefined subAgents",
				type: "sequential",
				patch: { subAgents: undefined },
				message: /Sub-agents required for sequential/,
			},
			{
				label: "parallel forced non-array subAgents",
				type: "parallel",
				patch: { subAgents: { not: "array" } },
				message: /Sub-agents required for parallel/,
			},
			{
				label: "loop forced null subAgents",
				type: "loop",
				patch: { subAgents: null },
				message: /Sub-agents required for loop/,
			},
			{
				label: "langgraph forced missing rootNode",
				type: "langgraph",
				patch: { rootNode: undefined },
				message: /Nodes and root node required for LangGraph/,
			},
			{
				label: "langgraph forced non-string rootNode",
				type: "langgraph",
				patch: { rootNode: 12 },
				message: /Nodes and root node required for LangGraph/,
			},
		])("$label", async ({ type, patch, message }) => {
			const builder =
				AgentBuilder.create("forced_cfg").withModel("gemini-2.5-flash");
			(builder as any).agentType = type;
			if (type === "langgraph") {
				(builder as any).config.nodes = [{ name: "n", agent: child("n") }];
				(builder as any).config.rootNode = "n";
			} else {
				(builder as any).config.subAgents = [child("c")];
			}
			Object.assign((builder as any).config, patch);
			await expect(builder.build()).rejects.toThrow(message);
		});
	});

	describe("locked mutator warn matrix (message includes method)", () => {
		it.each([
			["withModel", (b: AgentBuilder) => b.withModel("gemini-2.5-flash")],
			["withDescription", (b: AgentBuilder) => b.withDescription("x")],
			["withInstruction", (b: AgentBuilder) => b.withInstruction("x")],
			["withOutputKey", (b: AgentBuilder) => b.withOutputKey("k")],
			["asLoop", (b: AgentBuilder) => b.asLoop([child("c")], 2)],
			[
				"asLangGraph",
				(b: AgentBuilder) =>
					b.asLangGraph([{ name: "n", agent: child("n") }], "n"),
			],
		] as const)("%s warns with method name when locked", (method, apply) => {
			const builder = AgentBuilder.withAgent(child("locked"));
			const warn = vi.spyOn((builder as any).logger, "warn");
			apply(builder);
			expect(warn.mock.calls.some((c) => String(c[0]).includes(method))).toBe(
				true,
			);
		});
	});
});
