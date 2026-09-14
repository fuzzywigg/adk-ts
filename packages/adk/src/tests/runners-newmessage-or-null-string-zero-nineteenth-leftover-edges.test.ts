import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { RunConfig } from "../agents/run-config";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Nineteenth leftover (runners residual): `userContent: newMessage || null` —
 * falsy primitives coalesce to null; string `"0"` is kept.
 * Tested via `_newInvocationContext` (runAsync append requires `.parts`).
 */
describe("runners newMessage or-null string-zero nineteenth leftover", () => {
	let sessionService: InMemorySessionService;
	let agent: LlmAgent;
	let runner: Runner;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
		runner = new Runner({
			appName: "runner-nm-app",
			agent,
			sessionService,
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "ok" }] },
			});
		});
	});

	function ctxFor(newMessage: unknown) {
		const session = {
			id: "s1",
			userId: "u1",
			events: [],
		};
		return (runner as any)._newInvocationContext(session, {
			newMessage,
			runConfig: new RunConfig(),
		});
	}

	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "NaN", value: Number.NaN },
		{ label: "empty-string", value: "" },
	])("newMessage $label coalesces to null via ||", ({ value }) => {
		expect(ctxFor(value).userContent).toBeNull();
	});

	it('string "0" is truthy and kept as userContent', () => {
		expect(ctxFor("0").userContent).toBe("0");
	});
});
