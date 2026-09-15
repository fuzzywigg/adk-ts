import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../agents/invocation-context";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

class SentinelBeforeRunPlugin extends BasePlugin {
	constructor(private readonly value: unknown) {
		super("before-run-14-residual-deepen");
	}

	override async beforeRunCallback(_params: {
		invocationContext: InvocationContext;
	}): Promise<any> {
		return this.value;
	}
}

/**
 * Fourteenth leftover residual deepen (complements #254 -0/NaN/true/[]/neginf):
 * `if (earlyExitResult)` — string `"Infinity"` / `Object(1)` / `Object(false)`
 * all truthy early-exit (boxed false is an object, unlike bare `false` / `-0`).
 */
describe("runners before-run string-infinity/object-one/object-false fourteenth residual deepen", () => {
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
	])("truthy beforeRun $label early-exits without running agent", async ({
		value,
		label,
	}) => {
		await sessionService.createSession(
			"runner-before-14rd",
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
			appName: "runner-before-14rd",
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
