import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../agents/invocation-context";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { BasePlugin } from "../plugins/base-plugin";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

class TruthyBeforeRunPlugin extends BasePlugin {
	constructor(private readonly value: unknown) {
		super("truthy-before-run-nineteenth");
	}

	override async beforeRunCallback(_params: {
		invocationContext: InvocationContext;
	}): Promise<any> {
		return this.value;
	}
}

/**
 * Nineteenth leftover (runners residual): `if (earlyExitResult)` —
 * string `"0"`/`"false"` are truthy → early-exit (twelfth only defined-falsy
 * non-exit).
 */
describe("runners before-run string-zero/false early-exit nineteenth leftover", () => {
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
	])("truthy beforeRun $label early-exits; agent does not run", async ({
		value,
		label,
	}) => {
		await sessionService.createSession(
			"runner-truthy-early-app",
			"u1",
			{},
			`s-${label}`,
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
			appName: "runner-truthy-early-app",
			agent,
			sessionService,
			plugins: [new TruthyBeforeRunPlugin(value)],
		});

		const yielded: unknown[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: `s-${label}`,
			newMessage: { role: "user", parts: [{ text: "go" }] },
		})) {
			yielded.push(event);
		}

		expect(runAsync).not.toHaveBeenCalled();
		expect(yielded).toHaveLength(1);
		expect(yielded[0]).toBe(value);
	});
});
