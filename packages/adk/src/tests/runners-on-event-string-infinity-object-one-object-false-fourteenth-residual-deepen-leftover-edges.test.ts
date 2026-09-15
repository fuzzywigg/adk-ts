import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fourteenth leftover residual deepen (complements #254 -0/NaN/±Infinity):
 * `yield modifiedEvent || event` — string `"Infinity"` / `Object(1)` /
 * `Object(false)` remain truthy sentinels (boxed false ≠ bare false coalesce).
 */
describe("runners onEvent string-infinity/object-one/object-false fourteenth residual deepen", () => {
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
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	] as const)("$label is truthy so sentinel is yielded as-is", async ({
		value,
		label,
	}) => {
		class TruthyPlugin extends BasePlugin {
			async onEventCallback() {
				return value as any;
			}
		}

		await sessionService.createSession(
			"runner-app14rd",
			"u1",
			{},
			`s-truthy-${label}`,
		);
		const runner = new Runner({
			appName: "runner-app14rd",
			agent,
			sessionService,
			plugins: [new TruthyPlugin("truthy-event-14rd")],
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
