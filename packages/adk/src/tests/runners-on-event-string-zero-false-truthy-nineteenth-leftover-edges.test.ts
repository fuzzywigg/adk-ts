import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Nineteenth leftover (runners residual): `yield modifiedEvent || event` —
 * string `"0"`/`"false"` are truthy so the string is yielded (seventh only
 * covered falsy coalesce).
 */
describe("runners onEvent string-zero/false truthy nineteenth leftover", () => {
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
		{ label: "string-zero", value: "0" },
		{ label: "string-false", value: "false" },
	])("yields truthy $label from onEventCallback via modified || event", async ({
		value,
		label,
	}) => {
		class TruthyEventPlugin extends BasePlugin {
			async onEventCallback() {
				return value as any;
			}
		}

		await sessionService.createSession(
			"runner-app",
			"u1",
			{},
			`s-truthy-${label}`,
		);
		const runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			plugins: [new TruthyEventPlugin("truthy-event")],
		});
		const original = new Event({
			author: "root_agent",
			content: { role: "model", parts: [{ text: "original" }] },
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield original;
		});

		const events: unknown[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: `s-truthy-${label}`,
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0]).toBe(value);
		expect(events[0]).not.toBe(original);
	});
});
