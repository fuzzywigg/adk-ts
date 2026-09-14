import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { LoopAgent } from "../../agents/loop-agent.js";
import { LlmAgent } from "../../agents/llm-agent.js";
import { ParallelAgent } from "../../agents/parallel-agent.js";
import { SequentialAgent } from "../../agents/sequential-agent.js";
import { Event } from "../../events/event.js";
import { BasePlugin } from "../../plugins/base-plugin.js";
import { Runner } from "../../runners.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";
import { createTool } from "../../tools/base/create-tool.js";

class StubPlugin extends BasePlugin {
	constructor(name = "stub") {
		super(name);
	}
}

function mockRunnerEvents(events: Event[]) {
	vi.spyOn(Runner.prototype, "runAsync").mockImplementation(async function* () {
		for (const event of events) {
			yield event;
		}
	});
	vi.spyOn(Runner.prototype, "rewind").mockResolvedValue(undefined as never);
}

describe("AgentBuilder leftover edges", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	it("create() defaults name to default_agent", () => {
		const builder = AgentBuilder.create();
		expect((builder as any).config.name).toBe("default_agent");
	});

	it("withAgent uses agent.name || default_agent and locks definition", async () => {
		const named = new LlmAgent({
			name: "wrapped_agent",
			model: "gemini-2.5-flash",
		});
		const builder = AgentBuilder.withAgent(named);
		expect((builder as any).config.name).toBe("wrapped_agent");
		expect((builder as any).definitionLocked).toBe(true);
		const { agent } = await builder.build();
		expect(agent).toBe(named);
	});

	it("withAgent falls back to default_agent when agent name is empty", async () => {
		const nameless = new LlmAgent({
			name: "temp",
			model: "gemini-2.5-flash",
		});
		(nameless as { name: string }).name = "";
		const builder = AgentBuilder.withAgent(nameless);
		expect((builder as any).config.name).toBe("default_agent");
		const { agent } = await builder.build();
		expect(agent).toBe(nameless);
	});

	it("withTools spreads onto tools || [] across calls", async () => {
		const toolA = createTool({
			name: "tool_a",
			description: "Tool A",
			fn: () => "a",
		});
		const toolB = createTool({
			name: "tool_b",
			description: "Tool B",
			fn: () => "b",
		});
		const { agent } = await AgentBuilder.create("tools_spread")
			.withModel("gemini-2.5-flash")
			.withTools(toolA)
			.withTools(toolB)
			.build();

		expect((agent as LlmAgent).tools).toEqual([toolA, toolB]);
	});

	it("withPlugins spreads onto plugins || [] across calls", async () => {
		const pluginA = new StubPlugin("a");
		const pluginB = new StubPlugin("b");
		const builder = AgentBuilder.create("plugin_spread")
			.withModel("gemini-2.5-flash")
			.withPlugins(pluginA)
			.withPlugins(pluginB);

		expect((builder as any).config.plugins).toEqual([pluginA, pluginB]);
	});

	it("sequential createAgent uses description || empty string", async () => {
		const child = new LlmAgent({
			name: "child",
			model: "gemini-2.5-flash",
		});
		const { agent } = await AgentBuilder.create("seq_desc")
			.asSequential([child])
			.build();
		expect(agent).toBeInstanceOf(SequentialAgent);
		expect(agent.description).toBe("");
	});

	it("parallel createAgent uses description || empty string", async () => {
		const child = new LlmAgent({
			name: "child",
			model: "gemini-2.5-flash",
		});
		const { agent } = await AgentBuilder.create("par_desc")
			.asParallel([child])
			.build();
		expect(agent).toBeInstanceOf(ParallelAgent);
		expect(agent.description).toBe("");
	});

	it("loop createAgent uses maxIterations || 3 including when set to 0", async () => {
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

	it("loop createAgent defaults maxIterations to 3 when omitted", async () => {
		const child = new LlmAgent({
			name: "loop_child",
			model: "gemini-2.5-flash",
		});
		const builder = AgentBuilder.create("loop_default").asLoop([child]);
		const { agent } = await builder.build();
		expect((agent as LoopAgent).maxIterations).toBe(3);
	});

	it("enhanced ask uses subAgentNames || [] for multi-agent responses", async () => {
		const alpha = new LlmAgent({ name: "alpha", model: "gemini-2.5-flash" });
		const beta = new LlmAgent({ name: "beta", model: "gemini-2.5-flash" });
		mockRunnerEvents([
			new Event({
				author: "alpha",
				content: { parts: [{ text: "A" }] },
			}),
			new Event({
				author: "beta",
				content: { parts: [{ text: "B" }] },
			}),
		]);

		const { runner } = await AgentBuilder.create("multi_names")
			.asParallel([alpha, beta])
			.withSessionService(sessionService, {
				userId: "u",
				appName: "a",
			})
			.build();

		await expect(runner.ask("go")).resolves.toEqual([
			{ agent: "alpha", response: "A" },
			{ agent: "beta", response: "B" },
		]);
	});

	it("enhanced ask stringifies non-Error JSON parse failures in schema path", async () => {
		mockRunnerEvents([
			new Event({
				author: "schema",
				content: { parts: [{ text: "{bad json" }] },
			}),
		]);

		const schema = z.object({ value: z.string() });
		const { runner } = await AgentBuilder.create("parse_string")
			.withModel("gemini-2.5-flash")
			.withOutputSchema(schema)
			.withSessionService(sessionService, {
				userId: "u",
				appName: "a",
			})
			.build();

		await expect(runner.ask("q")).rejects.toThrow(/JSON parse error:/);
	});

	it("enhanced ask stringifies non-Error Zod validation failures", async () => {
		mockRunnerEvents([
			new Event({
				author: "schema",
				content: { parts: [{ text: '{"value":1}' }] },
			}),
		]);

		const throwingSchema = {
			parse: () => {
				throw "plain-zod-failure";
			},
		} as any;

		const { runner } = await AgentBuilder.create("zod_string")
			.withModel("gemini-2.5-flash")
			.withOutputSchema(throwingSchema)
			.withSessionService(sessionService, {
				userId: "u",
				appName: "a",
			})
			.build();

		await expect(runner.ask("q")).rejects.toThrow(/plain-zod-failure/);
		await expect(runner.ask("q")).rejects.toThrow(/Zod validation error:/);
	});

	it("withSessionService applies userId and appName defaults when omitted", async () => {
		const createSession = vi.spyOn(sessionService, "createSession");
		const builder =
			AgentBuilder.create("session_defaults").withModel("gemini-2.5-flash");

		const { session } = await builder
			.withSessionService(sessionService, {})
			.build();

		expect(createSession).toHaveBeenCalledWith(
			"app-session_defaults",
			expect.stringMatching(/^user-session_defaults-/),
			undefined,
			undefined,
		);
		expect(session.appName).toBe("app-session_defaults");
		expect(session.userId).toMatch(/^user-session_defaults-/);
	});

	it("withSessionService preserves explicit userId and appName", async () => {
		const createSession = vi.spyOn(sessionService, "createSession");
		const { session } = await AgentBuilder.create("session_explicit")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, {
				userId: "explicit-user",
				appName: "explicit-app",
			})
			.build();

		expect(createSession).toHaveBeenCalledWith(
			"explicit-app",
			"explicit-user",
			undefined,
			undefined,
		);
		expect(session.userId).toBe("explicit-user");
		expect(session.appName).toBe("explicit-app");
	});

	it("withSession copies session fields into sessionOptions", async () => {
		const existing = await sessionService.createSession(
			"reuse-app",
			"reuse-user",
			{ seed: 1 },
			"reuse-session",
		);

		const { session } = await AgentBuilder.create("reuse_session")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService)
			.withSession(existing)
			.build();

		expect(session).toBe(existing);
		expect(session.id).toBe("reuse-session");
		expect(session.userId).toBe("reuse-user");
		expect(session.appName).toBe("reuse-app");
	});
});
