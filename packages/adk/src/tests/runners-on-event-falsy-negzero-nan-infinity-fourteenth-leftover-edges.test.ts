import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fourteenth leftover (HEAVY tip-relaunch residual after #243):
 * `yield modifiedEvent || event` falsy residual — seventh pinned null/false/0/"",
 * fourteenth pinned truthy sentinels; `-0`/`NaN` still coalesce while ±Infinity
 * remain truthy sentinels.
 */
describe("runners onEvent falsy negzero/nan/infinity fourteenth leftover", () => {
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
		{ label: "-0", value: -0 },
		{ label: "NaN", value: Number.NaN },
	] as const)("yields original event when onEvent returns falsy $label", async ({
		value,
		label,
	}) => {
		class FalsyEventPlugin extends BasePlugin {
			async onEventCallback() {
				return value as any;
			}
		}

		await sessionService.createSession(
			"runner-app14h",
			"u1",
			{},
			`s-falsy-${label}`,
		);
		const runner = new Runner({
			appName: "runner-app14h",
			agent,
			sessionService,
			plugins: [new FalsyEventPlugin("falsy-event-heavy")],
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
			sessionId: `s-falsy-${label}`,
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0]).toBe(original);
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	] as const)("$label is truthy so sentinel is yielded as-is", async ({
		value,
		label,
	}) => {
		class TruthyInfPlugin extends BasePlugin {
			async onEventCallback() {
				return value as any;
			}
		}

		await sessionService.createSession(
			"runner-app14h",
			"u1",
			{},
			`s-inf-${label}`,
		);
		const runner = new Runner({
			appName: "runner-app14h",
			agent,
			sessionService,
			plugins: [new TruthyInfPlugin("inf-event")],
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
			sessionId: `s-inf-${label}`,
			newMessage: { role: "user", parts: [{ text: "hi" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0]).toBe(value);
		expect(events[0]).not.toBe(original);
	});
});
