import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { InMemoryMemoryService } from "../memory/in-memory-memory-service";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Eleventh leftover: if (!event.partial) appends — only truthy partial skips.
 * Prior leftovers cover partial: true|false; falsy non-booleans still append.
 */
describe("runners partial falsy append eleventh leftover", () => {
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
		{ label: "0", partial: 0 },
		{ label: '""', partial: "" },
		{ label: "null", partial: null },
		{ label: "undefined", partial: undefined },
		{ label: "false", partial: false },
	])("falsy partial ($label) still appends + memory", async ({ partial }) => {
		await sessionService.createSession(
			"runner-app",
			"u1",
			{},
			`s-partial-${String(partial)}`,
		);
		const memoryService = new InMemoryMemoryService();
		const memorySpy = vi
			.spyOn(memoryService, "addSessionToMemory")
			.mockResolvedValue(undefined);
		const appendSpy = vi.spyOn(sessionService, "appendEvent");

		const runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			memoryService,
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				partial: partial as any,
				content: { role: "model", parts: [{ text: "chunk" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: `s-partial-${String(partial)}`,
			newMessage: { role: "user", parts: [{ text: "q" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(appendSpy).toHaveBeenCalled();
		expect(memorySpy).toHaveBeenCalledTimes(1);
	});

	it("truthy partial true skips append and memory", async () => {
		await sessionService.createSession(
			"runner-app",
			"u1",
			{},
			"s-partial-true",
		);
		const memoryService = new InMemoryMemoryService();
		const memorySpy = vi
			.spyOn(memoryService, "addSessionToMemory")
			.mockResolvedValue(undefined);
		const appendSpy = vi.spyOn(sessionService, "appendEvent");

		const runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			memoryService,
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				partial: true,
				content: { role: "model", parts: [{ text: "stream" }] },
			});
		});

		const events: Event[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-partial-true",
			newMessage: { role: "user", parts: [{ text: "q" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0].partial).toBe(true);
		// user message may still append; agent partial must not
		const agentAppends = appendSpy.mock.calls.filter(
			(c) => (c[1] as Event).author === "root_agent",
		);
		expect(agentAppends).toHaveLength(0);
		expect(memorySpy).not.toHaveBeenCalled();
	});
});
