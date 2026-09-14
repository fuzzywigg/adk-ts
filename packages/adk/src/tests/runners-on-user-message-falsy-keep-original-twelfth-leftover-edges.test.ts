import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

class FalsyOnUserMessagePlugin extends BasePlugin {
	constructor(private readonly value: unknown) {
		super("falsy-on-user-twelfth");
	}

	override async onUserMessageCallback(): Promise<any> {
		return this.value;
	}
}

/**
 * Twelfth leftover: `if (modifiedUserMessage)` keeps the original content when
 * onUserMessageCallback returns defined falsy (`null`/`0`/`""`/`false`).
 */
describe("runners on-user-message falsy keep-original twelfth leftover edges", () => {
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
		{ label: "null", value: null },
		{ label: "0", value: 0 },
		{ label: "empty-string", value: "" },
		{ label: "false", value: false },
	])("onUserMessage $label keeps original user text", async ({
		value,
		label,
	}) => {
		const sessionId = `s-keep-${label}`;
		await sessionService.createSession(
			"runner-falsy-user-app",
			"u1",
			{},
			sessionId,
		);
		const runner = new Runner({
			appName: "runner-falsy-user-app",
			agent,
			sessionService,
			plugins: [new FalsyOnUserMessagePlugin(value)],
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId,
			newMessage: { role: "user", parts: [{ text: "keep-me" }] },
		})) {
			// drain
		}

		const session = await sessionService.getSession(
			"runner-falsy-user-app",
			"u1",
			sessionId,
		);
		expect(
			session?.events.find((e) => e.author === "user")?.content?.parts?.[0]
				?.text,
		).toBe("keep-me");
	});

	it("truthy replacement still applied (control)", async () => {
		await sessionService.createSession(
			"runner-falsy-user-app",
			"u1",
			{},
			"s-replace",
		);
		const runner = new Runner({
			appName: "runner-falsy-user-app",
			agent,
			sessionService,
			plugins: [
				new FalsyOnUserMessagePlugin({
					role: "user",
					parts: [{ text: "replaced" }],
				}),
			],
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-replace",
			newMessage: { role: "user", parts: [{ text: "keep-me" }] },
		})) {
			// drain
		}

		const session = await sessionService.getSession(
			"runner-falsy-user-app",
			"u1",
			"s-replace",
		);
		expect(
			session?.events.find((e) => e.author === "user")?.content?.parts?.[0]
				?.text,
		).toBe("replaced");
	});
});
