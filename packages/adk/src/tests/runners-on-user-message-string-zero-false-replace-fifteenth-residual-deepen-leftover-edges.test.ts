import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

class TruthyOnUserMessagePlugin extends BasePlugin {
	constructor(private readonly value: unknown) {
		super("truthy-on-user-fifteenth-residual-deepen");
	}

	override async onUserMessageCallback(): Promise<any> {
		return this.value;
	}
}

/**
 * Fifteenth residual deepen (HEAVY tip-relaunch residual after tip 1f70668 (post #282/#284); supersedes closed #281/#285/#273/#262
 * path — string `"0"` / `"false"` pass `if (modifiedUserMessage)` and replace
 * userMessage; without artifact blob saves, Runner spreads the string into
 * content (`{..."0"}`) so original text is lost (no TypeError).
 */
describe("runners on-user-message string-zero/false replace fifteenth residual deepen", () => {
	let sessionService: InMemorySessionService;
	let agent: LlmAgent;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("onUserMessage $label replaces Content via object-spread of the string", async ({
		value,
		label,
	}) => {
		const sessionId = `s-spread-${label}`;
		await sessionService.createSession(
			"runner-truthy-user-app",
			"u1",
			{},
			sessionId,
		);
		const runner = new Runner({
			appName: "runner-truthy-user-app",
			agent,
			sessionService,
			plugins: [new TruthyOnUserMessagePlugin(value)],
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId,
			newMessage: { role: "user", parts: [{ text: "keep-me" }] },
		})) {
			// drain
		}

		const session = await sessionService.getSession(
			"runner-truthy-user-app",
			"u1",
			sessionId,
		);
		const userEvent = session?.events.find((e) => e.author === "user");
		expect(userEvent?.content?.parts?.[0]?.text).not.toBe("keep-me");
		expect(userEvent?.content?.role).toBe("user");
		// String spread puts char indices on the content object
		expect((userEvent?.content as any)?.[0]).toBe(value[0]);
	});

	it("numeric 0 still keeps original (twelfth control)", async () => {
		await sessionService.createSession(
			"runner-truthy-user-app",
			"u1",
			{},
			"s-num-zero",
		);
		const runner = new Runner({
			appName: "runner-truthy-user-app",
			agent,
			sessionService,
			plugins: [new TruthyOnUserMessagePlugin(0)],
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-num-zero",
			newMessage: { role: "user", parts: [{ text: "keep-me" }] },
		})) {
			// drain
		}

		const session = await sessionService.getSession(
			"runner-truthy-user-app",
			"u1",
			"s-num-zero",
		);
		expect(
			session?.events.find((e) => e.author === "user")?.content?.parts?.[0]
				?.text,
		).toBe("keep-me");
	});
});
