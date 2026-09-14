import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../agents/invocation-context";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

class SentinelBeforeRunPlugin extends BasePlugin {
	constructor(private readonly value: unknown) {
		super("before-run-heavy-14");
	}

	override async beforeRunCallback(_params: {
		invocationContext: InvocationContext;
	}): Promise<any> {
		return this.value;
	}
}

/**
 * Fourteenth leftover (HEAVY tip-relaunch residual after #243):
 * `if (earlyExitResult)` residual after twelfth classic falsy — `-0`/`NaN` do
 * not early-exit; `true`/`"true"`/`[]`/`NEGATIVE_INFINITY` early-exit as-is.
 */
describe("runners before-run truthy sentinels/negzero fourteenth leftover", () => {
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
	])("falsy beforeRun $label does not early-exit; agent still runs", async ({
		value,
		label,
	}) => {
		await sessionService.createSession(
			"runner-before-heavy",
			"u1",
			{},
			`s-falsy-${label}`,
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
			appName: "runner-before-heavy",
			agent,
			sessionService,
			plugins: [new SentinelBeforeRunPlugin(value)],
		});

		const yielded: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: `s-falsy-${label}`,
			newMessage: { role: "user", parts: [{ text: "go" }] },
		})) {
			yielded.push(event);
		}

		expect(runAsync).toHaveBeenCalled();
		expect(yielded.map((e) => e.content?.parts?.[0]?.text)).toContain("ran");
	});

	it.each([
		{ label: "true", value: true },
		{ label: "string-true", value: "true" },
		{ label: "empty-array", value: [] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("truthy beforeRun $label early-exits without running agent", async ({
		value,
		label,
	}) => {
		await sessionService.createSession(
			"runner-before-heavy",
			"u1",
			{},
			`s-truthy-${label}`,
		);
		const runAsync = vi
			.spyOn(agent, "runAsync")
			.mockImplementation(async function* () {
				yield new Event({
					author: "root_agent",
					content: { role: "model", parts: [{ text: "should-not" }] },
				});
			});
		const runner = new Runner({
			appName: "runner-before-heavy",
			agent,
			sessionService,
			plugins: [new SentinelBeforeRunPlugin(value)],
		});

		const yielded: unknown[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: `s-truthy-${label}`,
			newMessage: { role: "user", parts: [{ text: "go" }] },
		})) {
			yielded.push(event);
		}

		expect(runAsync).not.toHaveBeenCalled();
		expect(yielded).toHaveLength(1);
		expect(yielded[0]).toBe(value);
	});
});
