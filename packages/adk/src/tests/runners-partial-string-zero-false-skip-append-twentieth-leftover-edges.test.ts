import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { InMemoryMemoryService } from "../memory/in-memory-memory-service";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Twentieth leftover: eleventh leftover pins classic falsy `partial` still
 * appending via `if (!event.partial)`. String `"0"` / `"false"` are truthy so
 * append + memory are skipped (same branch as `partial: true`).
 */
describe("runners partial string-zero/false skip-append twentieth leftover", () => {
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
		{ label: '"0"', partial: "0" },
		{ label: '"false"', partial: "false" },
	])("truthy string partial $label skips agent append + memory", async ({
		partial,
		label,
	}) => {
		await sessionService.createSession(
			"runner-app",
			"u1",
			{},
			`s-partial-${label}`,
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
			sessionId: `s-partial-${label}`,
			newMessage: { role: "user", parts: [{ text: "q" }] },
		})) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		const agentAppends = appendSpy.mock.calls.filter(
			(c) => (c[1] as Event).author === "root_agent",
		);
		expect(agentAppends).toHaveLength(0);
		expect(memorySpy).not.toHaveBeenCalled();
	});

	it("numeric 0 still appends (eleventh control)", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-num-zero");
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
				partial: 0 as any,
				content: { role: "model", parts: [{ text: "chunk" }] },
			});
		});

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId: "s-num-zero",
			newMessage: { role: "user", parts: [{ text: "q" }] },
		})) {
		}

		const agentAppends = appendSpy.mock.calls.filter(
			(c) => (c[1] as Event).author === "root_agent",
		);
		expect(agentAppends).toHaveLength(1);
		expect(memorySpy).toHaveBeenCalledTimes(1);
	});
});
