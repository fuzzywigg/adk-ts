import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { InMemoryMemoryService } from "../memory/in-memory-memory-service";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

/**
 * Fourteenth leftover: `if (!event.partial)` residual after eleventh —
 * `"false"`/`[]` truthy skip append; `-0`/`NaN` falsy still append.
 */
describe("runners partial string-false/empty-array fourteenth leftover", () => {
	let sessionService: InMemorySessionService;
	let agent: LlmAgent;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
	});

	async function runPartial(sessionId: string, partial: unknown) {
		await sessionService.createSession("runner-app14", "u1", {}, sessionId);
		const memoryService = new InMemoryMemoryService();
		const memorySpy = vi
			.spyOn(memoryService, "addSessionToMemory")
			.mockResolvedValue(undefined);
		const appendSpy = vi.spyOn(sessionService, "appendEvent");

		const runner = new Runner({
			appName: "runner-app14",
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

		for await (const _ of runner.runAsync({
			userId: "u1",
			sessionId,
			newMessage: { role: "user", parts: [{ text: "q" }] },
		})) {
		}

		const agentAppends = appendSpy.mock.calls.filter(
			(c) => (c[1] as Event).author === "root_agent",
		);
		return { agentAppends, memorySpy };
	}

	it.each([
		{ label: "string-false", partial: "false" },
		{ label: "empty-array", partial: [] },
		{ label: "string-true", partial: "true" },
	])("truthy partial ($label) skips agent append + memory", async ({
		partial,
		label,
	}) => {
		const { agentAppends, memorySpy } = await runPartial(
			`s-truthy-${label}`,
			partial,
		);
		expect(agentAppends).toHaveLength(0);
		expect(memorySpy).not.toHaveBeenCalled();
	});

	it.each([
		{ label: "-0", partial: -0 },
		{ label: "NaN", partial: Number.NaN },
	])("falsy partial ($label) still appends + memory", async ({
		partial,
		label,
	}) => {
		const { agentAppends, memorySpy } = await runPartial(
			`s-falsy-${label}`,
			partial,
		);
		expect(agentAppends.length).toBeGreaterThan(0);
		expect(memorySpy).toHaveBeenCalledTimes(1);
	});
});
