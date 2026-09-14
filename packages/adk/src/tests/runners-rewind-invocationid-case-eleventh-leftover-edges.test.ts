import { beforeEach, describe, expect, it } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { EventActions } from "../events/event-actions";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Eleventh leftover: rewind looks up invocationId with `===`, so case and
 * padding near-misses throw Invocation ID not found.
 */
describe("runners rewind invocationId case eleventh leftover", () => {
	let runner: Runner;
	const userId = "u1";
	const sessionId = "s-rewind-case";

	beforeEach(() => {
		runner = new Runner({
			appName: "rewind-case-app",
			agent: new LlmAgent({
				name: "root_agent",
				model: "gemini-2.0-flash-exp",
			}),
			sessionService: new InMemorySessionService(),
		});
	});

	async function seed(invocationId: string) {
		const session = await runner.sessionService.createSession(
			runner.appName,
			userId,
			{},
			sessionId,
		);
		await runner.sessionService.appendEvent(
			session,
			new Event({
				invocationId,
				author: "root_agent",
				content: { role: "model", parts: [{ text: "one" }] },
				actions: new EventActions({ stateDelta: { k: "v" } }),
			}),
		);
		return session;
	}

	it.each([
		"INV-1",
		"Inv-1",
		"inv-1 ",
		" inv-1",
	])("does not match near-miss rewindBeforeInvocationId %j", async (rewindBeforeInvocationId) => {
		await seed("inv-1");
		await expect(
			runner.rewind({
				userId,
				sessionId,
				rewindBeforeInvocationId,
			}),
		).rejects.toThrow(`Invocation ID not found: ${rewindBeforeInvocationId}`);
	});

	it("exact invocationId still rewinds", async () => {
		await seed("inv-1");
		await expect(
			runner.rewind({
				userId,
				sessionId,
				rewindBeforeInvocationId: "inv-1",
			}),
		).resolves.toBeUndefined();
	});
});
