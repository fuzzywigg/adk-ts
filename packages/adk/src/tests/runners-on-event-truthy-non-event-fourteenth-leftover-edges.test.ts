import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fourteenth leftover: `yield modifiedEvent || event` residual after seventh —
 * truthy non-Event sentinels (`true`/`"true"`/`[]`/`1`) are yielded as-is.
 */
describe("runners onEvent truthy non-Event fourteenth leftover", () => {
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
		{ label: "true", value: true },
		{ label: "string-true", value: "true" },
		{ label: "empty-array", value: [] },
		{ label: "1", value: 1 },
	] as const)("yields onEvent sentinel $label instead of original Event", async ({
		value,
		label,
	}) => {
		class TruthyEventPlugin extends BasePlugin {
			async onEventCallback() {
				return value as any;
			}
		}

		await sessionService.createSession(
			"runner-app14",
			"u1",
			{},
			`s-truthy-${label}`,
		);
		const runner = new Runner({
			appName: "runner-app14",
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
