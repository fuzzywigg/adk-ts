import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

describe("Runner deepen edges (TOKENMAXX remainder)", () => {
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
			appName: "runner-deepen-app",
			agent,
			sessionService,
		});
	});

	it("sync run drains delayed multi-event streams after async completes", async () => {
		await sessionService.createSession(
			"runner-deepen-app",
			"u1",
			{},
			"s-delayed-multi",
		);

		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			await new Promise((r) => setTimeout(r, 5));
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "one" }] },
			});
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "two" }] },
			});
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "three" }] },
			});
		});

		const generator = runner.run({
			userId: "u1",
			sessionId: "s-delayed-multi",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		});

		await vi.waitFor(async () => {
			const session = await sessionService.getSession(
				"runner-deepen-app",
				"u1",
				"s-delayed-multi",
			);
			expect(
				session?.events.filter((e) => e.author === "root_agent"),
			).toHaveLength(3);
		});

		const events = [...generator];
		expect(events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"one",
			"two",
			"three",
		]);
	});

	it("sync run breaks cleanly when async completes with only the null sentinel", async () => {
		await sessionService.createSession(
			"runner-deepen-app",
			"u1",
			{},
			"s-sentinel-only",
		);

		let finished = false;
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			await new Promise((r) => setTimeout(r, 5));
			finished = true;
		});

		const generator = runner.run({
			userId: "u1",
			sessionId: "s-sentinel-only",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		});

		await vi.waitFor(() => {
			expect(finished).toBe(true);
		});

		const events = [...generator];
		expect(events).toEqual([]);
	});

	it("sync run drains a single late event after a short delay", async () => {
		await sessionService.createSession(
			"runner-deepen-app",
			"u1",
			{},
			"s-sync-late",
		);

		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			await new Promise((r) => setTimeout(r, 8));
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "late-only" }] },
			});
		});

		const generator = runner.run({
			userId: "u1",
			sessionId: "s-sync-late",
			newMessage: { role: "user", parts: [{ text: "go" }] },
		});

		await vi.waitFor(async () => {
			const session = await sessionService.getSession(
				"runner-deepen-app",
				"u1",
				"s-sync-late",
			);
			expect(
				session?.events.some(
					(e) => e.content?.parts?.[0]?.text === "late-only",
				),
			).toBe(true);
		});

		expect([...generator].map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"late-only",
		]);
	});

	it("runAsync still throws for missing sessions (non-sync path)", async () => {
		await expect(
			(async () => {
				for await (const _ of runner.runAsync({
					userId: "u1",
					sessionId: "missing",
					newMessage: { role: "user", parts: [{ text: "x" }] },
				})) {
					// drain
				}
			})(),
		).rejects.toThrow(/Session not found/);
	});
});
