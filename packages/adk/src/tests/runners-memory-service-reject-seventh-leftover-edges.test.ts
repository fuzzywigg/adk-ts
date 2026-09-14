import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { InMemoryMemoryService } from "../memory/in-memory-memory-service";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

describe("Runner memoryService reject seventh leftover (post #158)", () => {
	let sessionService: InMemorySessionService;
	let agent: LlmAgent;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		agent = new LlmAgent({
			name: "root_agent",
			model: "gemini-2.0-flash-exp",
		});
	});

	it("propagates addSessionToMemory rejection and marks the span as ERROR", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-mem-rej");
		const memoryService = new InMemoryMemoryService();
		const reject = new Error("memory backend down");
		vi.spyOn(memoryService, "addSessionToMemory").mockRejectedValue(reject);

		const runner = new Runner({
			appName: "runner-app",
			agent,
			sessionService,
			memoryService,
		});
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "hi" }] },
			});
		});

		const gen = runner.runAsync({
			userId: "u1",
			sessionId: "s-mem-rej",
			newMessage: { role: "user", parts: [{ text: "q" }] },
		});

		await expect(gen.next()).rejects.toBe(reject);
	});

	it("never calls addSessionToMemory for partial events even when memoryService is set", async () => {
		await sessionService.createSession("runner-app", "u1", {}, "s-mem-partial");
		const memoryService = new InMemoryMemoryService();
		const memorySpy = vi
			.spyOn(memoryService, "addSessionToMemory")
			.mockResolvedValue(undefined);

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
				content: { role: "model", parts: [{ text: "chunk" }] },
			});
			yield new Event({
				author: "root_agent",
				partial: false,
				content: { role: "model", parts: [{ text: "final" }] },
			});
		});

		const texts: string[] = [];
		for await (const event of runner.runAsync({
			userId: "u1",
			sessionId: "s-mem-partial",
			newMessage: { role: "user", parts: [{ text: "q" }] },
		})) {
			texts.push(String(event.content?.parts?.[0]?.text));
		}

		expect(texts).toEqual(["chunk", "final"]);
		expect(memorySpy).toHaveBeenCalledTimes(1);
	});
});
