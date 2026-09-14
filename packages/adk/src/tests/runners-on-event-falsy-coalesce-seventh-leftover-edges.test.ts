import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

describe("Runner onEvent falsy coalesce seventh leftover (post #158)", () => {
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
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: '""', value: "" },
	] as const)("yields original event when onEventCallback returns falsy $label via modified || event", async ({
		value,
	}) => {
		class FalsyEventPlugin extends BasePlugin {
			async onEventCallback() {
				return value as any;
			}
		}

		await sessionService.createSession(
			"runner-app",
			"u1",
			{},
			`s-falsy-${String(value)}`,
		);
		const runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			plugins: [new FalsyEventPlugin("falsy-event")],
		});
		const original = new Event({
			author: "root_agent",
			content: { role: "model", parts: [{ text: "original" }] },
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield original;
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: `s-falsy-${String(value)}`,
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0]).toBe(original);
		expect(events[0].content?.parts?.[0]?.text).toBe("original");
	});
});
