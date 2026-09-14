import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import type { InvocationContext } from "../agents/invocation-context";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

class FalsyBeforeRunPlugin extends BasePlugin {
	constructor(private readonly value: unknown) {
		super("falsy-before-run-twelfth");
	}

	override async beforeRunCallback(_params: {
		invocationContext: InvocationContext;
	}): Promise<any> {
		return this.value;
	}
}

/**
 * Twelfth leftover: PluginManager returns defined falsy via `!== undefined`,
 * but Runner only early-exits on `if (earlyExitResult)` truthiness.
 */
describe("runners before-run falsy early-exit truthiness twelfth leftover edges", () => {
	let sessionService: InMemorySessionService;
	let agent: LlmAgent;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
	});

	it.each([
		{ label: "null", value: null },
		{ label: "0", value: 0 },
		{ label: "empty-string", value: "" },
		{ label: "false", value: false },
	])("defined falsy beforeRun $label does not early-exit; agent still runs", async ({
		value,
	}) => {
		await sessionService.createSession(
			"runner-falsy-early-app",
			"u1",
			{},
			`s-${String(value)}`,
		);
		const runAsync = vi
			.spyOn(agent, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "root_agent",
					content: { role: "model", parts: [{ text: "ran" }] },
				});
			});
		const runner = new Runner({
			appName: "runner-falsy-early-app",
			agent,
			sessionService,
			plugins: [new FalsyBeforeRunPlugin(value)],
		});

		const yielded: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: `s-${String(value)}`,
			newMessage: { role: "user", parts: [{ text: "go" }] },
		})) {
			yielded.push(event);
		}

		expect(runAsync).toHaveBeenCalled();
		expect(yielded.map((e) => e.content?.parts?.[0]?.text)).toContain("ran");
	});

	it("truthy Event still early-exits (control)", async () => {
		await sessionService.createSession(
			"runner-falsy-early-app",
			"u1",
			{},
			"s-truthy",
		);
		const early = new Event({
			author: "early",
			content: { role: "model", parts: [{ text: "stopped" }] },
		});
		const runAsync = vi
			.spyOn(agent, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "root_agent",
					content: { role: "model", parts: [{ text: "should-not" }] },
				});
			});
		const runner = new Runner({
			appName: "runner-falsy-early-app",
			agent,
			sessionService,
			plugins: [new FalsyBeforeRunPlugin(early)],
		});

		const yielded: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-truthy",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		})) {
			yielded.push(event);
		}

		expect(runAsync).not.toHaveBeenCalled();
		expect(yielded).toHaveLength(1);
		expect(yielded[0].content?.parts?.[0]?.text).toBe("stopped");
	});
});
