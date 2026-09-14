import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

class TruthyOnUserMessagePlugin extends BasePlugin {
	constructor(private readonly value: unknown) {
		super("truthy-on-user-nineteenth");
	}

	override async onUserMessageCallback(): Promise<any> {
		return this.value;
	}
}

/**
 * Nineteenth leftover (runners residual): `if (modifiedUserMessage)` —
 * string `"0"`/`"false"` replace the original user message (twelfth kept
 * original on defined falsy).
 */
describe("runners on-user-message string-zero/false replace nineteenth leftover", () => {
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
		{ label: "string-zero", value: "0" },
		{ label: "string-false", value: "false" },
	])("onUserMessage $label replaces original user content", async ({
		value,
		label,
	}) => {
		const sessionId = `s-replace-${label}`;
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
		}

		const session = await sessionService.getSession(
			"runner-truthy-user-app",
			"u1",
			sessionId,
		);
		const userEvent = session?.events.find((e) => e.author === "user");
		// String replacement is spread: { ..."0", role: "user" } → indexed chars.
		expect(userEvent?.content).not.toEqual(
			expect.objectContaining({ parts: [{ text: "keep-me" }] }),
		);
		expect(userEvent?.content).toEqual({
			...Object.assign({}, value),
			role: "user",
		});
	});
});
