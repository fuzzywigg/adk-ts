import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";
import { Runner } from "../../runners";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";

function mockRunnerEvents(events: Event[]) {
	vi.spyOn(Runner.prototype, "runAsync").mockImplementation(async function* () {
		for (const event of events) {
			yield event;
		}
	});
}

describe("AgentBuilder leftover edges (TOKENMAXX post #124)", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it.each([
		["asSequential", "sequential"] as const,
		["asParallel", "parallel"] as const,
		["asLoop", "loop"] as const,
	])("%s rejects null subAgents", async (method) => {
		const builder = AgentBuilder.create(`null_${method}`);
		(builder as any)[method](null);
		await expect(builder.build()).rejects.toThrow(/Sub-agents required/);
	});

	it.each([
		["asSequential", {}] as const,
		["asParallel", "not-array"] as const,
		["asLoop", 42] as const,
	])("%s rejects non-array subAgents", async (method, bad) => {
		const builder = AgentBuilder.create(`bad_${method}`);
		(builder as any)[method](bad);
		await expect(builder.build()).rejects.toThrow(/Sub-agents required/);
	});

	it("langgraph createAgent rejects non-string rootNode via typeof guard", async () => {
		const child = new LlmAgent({
			name: "lg_child",
			model: "gemini-2.5-flash",
		});
		await expect(
			AgentBuilder.create("lg_bad_root")
				.asLangGraph(
					[{ name: "start", agent: child }],
					123 as unknown as string,
				)
				.build(),
		).rejects.toThrow(/Nodes and root node required/);
	});

	it("enhanced ask rejects LlmRequest-shaped message with empty contents", async () => {
		mockRunnerEvents([
			new Event({
				author: "ask_empty",
				content: { parts: [{ text: "unused" }] },
			}),
		]);
		const { runner } = await AgentBuilder.create("ask_empty")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, {
				userId: "u",
				appName: "a",
			})
			.build();

		await expect(runner.ask({ contents: [] } as any)).rejects.toThrow();
	});

	it("withSessionService generates default userId and appName from agent name", () => {
		const builder =
			AgentBuilder.create("named_defaults").withModel("gemini-2.5-flash");
		builder.withSessionService(sessionService, {});
		const opts = (builder as any).sessionOptions;
		expect(opts.userId).toMatch(/^user-named_defaults-/);
		expect(opts.appName).toBe("app-named_defaults");
	});

	it("withQuickSession without options uses the same default id generators", () => {
		const builder =
			AgentBuilder.create("quick_defaults").withModel("gemini-2.5-flash");
		builder.withQuickSession();
		const opts = (builder as any).sessionOptions;
		expect(opts.userId).toMatch(/^user-quick_defaults-/);
		expect(opts.appName).toBe("app-quick_defaults");
	});
});
