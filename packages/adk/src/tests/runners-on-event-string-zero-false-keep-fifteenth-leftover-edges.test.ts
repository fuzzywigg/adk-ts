import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fifteenth leftover: `yield modifiedEvent || event` residual after fourteenth
 * `true`/`"true"`/`[]`/`1` — string `"0"` / `"false"` are also kept as the
 * modified sentinel.
 */
describe("runners onEvent string-zero/false keep fifteenth leftover", () => {
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
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("onEventCallback $label is kept via || (not original event)", async ({
		value,
		label,
	}) => {
		class KeepTruthyPlugin extends BasePlugin {
			async onEventCallback() {
				return value as any;
			}
		}

		await sessionService.createSession(
			"runner-app",
			"u1",
			{},
			`s-keep-${label}`,
		);
		const runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			plugins: [new KeepTruthyPlugin("keep-truthy-event")],
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
			sessionId: `s-keep-${label}`,
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0]).toBe(value);
		expect(events[0]).not.toBe(original);
	});

	it("numeric 0 still falls back to original (seventh control)", async () => {
		class FalsyPlugin extends BasePlugin {
			async onEventCallback() {
				return 0 as any;
			}
		}

		await sessionService.createSession("runner-app", "u1", {}, "s-num-zero");
		const runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			plugins: [new FalsyPlugin("falsy-zero")],
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
			sessionId: "s-num-zero",
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0]).toBe(original);
	});
});
