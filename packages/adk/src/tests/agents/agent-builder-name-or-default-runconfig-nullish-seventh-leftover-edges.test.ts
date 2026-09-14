import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { LangGraphAgent } from "../../agents/lang-graph-agent.js";
import { LlmAgent } from "../../agents/llm-agent.js";
import { LoopAgent } from "../../agents/loop-agent.js";
import { RunConfig, StreamingMode } from "../../agents/run-config.js";
import { Event } from "../../events/event.js";
import { Runner } from "../../runners.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";
import { createTool } from "../../tools/base/create-tool.js";

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

/**
 * Seventh leftover: AgentBuilder name || default_agent, asLoop NaN/false || 3,
 * part.text "0" vs 0, runAsync params.runConfig ??, session userId after withSession.
 */
describe("AgentBuilder name-or-default / runConfig ?? seventh leftover", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "empty string", name: "" },
		{ label: "null", name: null },
		{ label: "undefined", name: undefined },
		{ label: "false", name: false },
		{ label: "0", name: 0 },
	])("static withAgent($label) uses agent.name || default_agent", async ({
		name,
	}) => {
		const stub = { name } as any;
		const builder = AgentBuilder.withAgent(stub);
		expect((builder as any).config.name).toBe("default_agent");
		expect((builder as any).existingAgent).toBe(stub);
	});

	it("static withAgent keeps whitespace name (truthy, not coalesced)", () => {
		const stub = { name: "   " } as any;
		const builder = AgentBuilder.withAgent(stub);
		expect((builder as any).config.name).toBe("   ");
	});

	it("instance withAgent only overwrites when config.name is default_agent and agent.name is truthy", () => {
		const renamed = AgentBuilder.create()
			.withModel("gemini-2.5-flash")
			.withAgent(child("renamed_ok"));
		expect((renamed as any).config.name).toBe("renamed_ok");

		const kept = AgentBuilder.create("custom_keep")
			.withModel("gemini-2.5-flash")
			.withAgent(child("ignored_name"));
		expect((kept as any).config.name).toBe("custom_keep");

		const emptyName = child("temp_empty");
		(emptyName as { name: string }).name = "";
		const staysDefault = AgentBuilder.create()
			.withModel("gemini-2.5-flash")
			.withAgent(emptyName);
		expect((staysDefault as any).config.name).toBe("default_agent");
	});

	it.each([
		{ label: "NaN", value: Number.NaN },
		{ label: "false", value: false },
		{ label: "empty string", value: "" },
		{ label: "null", value: null },
	])("loop maxIterations $label coalesces via || 3", async ({ value }) => {
		const builder = AgentBuilder.create("loop_falsy_iters").asLoop([
			child("c"),
		]);
		(builder as any).config.maxIterations = value;
		const { agent } = await builder.build();
		expect((agent as LoopAgent).maxIterations).toBe(3);
	});

	it("langgraph rootNode '0' is a truthy string and builds", async () => {
		const nodeAgent = child("n");
		const { agent } = await AgentBuilder.create("lg_zero_root")
			.asLangGraph([{ name: "0", agent: nodeAgent }], "0")
			.build();
		expect(agent).toBeInstanceOf(LangGraphAgent);
		expect((agent as LangGraphAgent).getRootNodeName()).toBe("0");
	});

	it("whitespace userId/appName are kept (|| does not treat them as missing)", async () => {
		const createSession = vi.spyOn(sessionService, "createSession");
		await AgentBuilder.create("ws_ids")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, {
				userId: "  ",
				appName: "  ",
			})
			.build();
		expect(createSession.mock.calls[0][0]).toBe("  ");
		expect(createSession.mock.calls[0][1]).toBe("  ");
	});

	it("withSession empty userId later fails ask via !sessionOptions?.userId", async () => {
		const session = await sessionService.createSession("app", "u");
		(session as { userId: string }).userId = "";
		const { runner } = await AgentBuilder.create("empty_session_user")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, { userId: "u", appName: "app" })
			.withSession(session)
			.build();
		await expect(runner.ask("hi")).rejects.toThrow(
			/Session configuration is required/,
		);
	});

	it('part.text 0 coalesces via || "" while string "0" is kept', async () => {
		mockRunnerEvents([
			new Event({
				author: "parts",
				content: {
					parts: [
						{ text: "0" },
						{ text: 0 as any },
						{ text: false as any },
						{ text: "" },
						{ text: "1" },
					],
				},
			}),
		]);
		const { runner } = await AgentBuilder.create("text_zero")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, { userId: "u", appName: "a" })
			.build();
		await expect(runner.ask("q")).resolves.toBe("01");
	});

	it("empty joined parts skip buffering (if (content) is falsy)", async () => {
		const alpha = child("alpha");
		mockRunnerEvents([
			new Event({
				author: "alpha",
				content: { parts: [{ text: "" }, { text: null as any }] },
			}),
			new Event({
				author: "alpha",
				content: { parts: [{ text: "kept" }] },
			}),
		]);
		const { runner } = await AgentBuilder.create("empty_content")
			.asSequential([alpha])
			.withSessionService(sessionService, { userId: "u", appName: "a" })
			.build();
		await expect(runner.ask("go")).resolves.toEqual([
			{ agent: "alpha", response: "kept" },
		]);
	});

	it("runAsync uses params.runConfig ?? builder runConfig (nullish falls back; 0/false kept)", async () => {
		const spy = vi
			.spyOn(Runner.prototype, "runAsync")
			.mockImplementation(async function* () {});
		const builderRun = new RunConfig({ streamingMode: StreamingMode.SSE });
		const { runner } = await AgentBuilder.create("rc_nullish")
			.withModel("gemini-2.5-flash")
			.withRunConfig(builderRun)
			.withSessionService(sessionService, { userId: "u", appName: "a" })
			.build();

		const session = await sessionService.createSession("a", "u");
		const drain = async (runConfig: any) => {
			const iter = runner.runAsync({
				userId: "u",
				sessionId: session.id,
				newMessage: { parts: [{ text: "x" }] },
				runConfig,
			});
			for await (const _ of iter) {
				/* drain */
			}
		};

		await drain(undefined);
		await drain(null);
		await drain(0);
		await drain(false);

		expect(spy.mock.calls[0][0].runConfig).toBe(builderRun);
		expect(spy.mock.calls[1][0].runConfig).toBe(builderRun);
		expect(spy.mock.calls[2][0].runConfig).toBe(0);
		expect(spy.mock.calls[3][0].runConfig).toBe(false);
	});

	it("withTools on a forced-null tools list still spreads via tools || []", async () => {
		const tool = createTool({
			name: "after_null",
			description: "tool after null list",
			fn: () => "ok",
		});
		const builder =
			AgentBuilder.create("tools_null").withModel("gemini-2.5-flash");
		(builder as any).config.tools = null;
		builder.withTools(tool);
		expect((builder as any).config.tools).toEqual([tool]);
	});
});
