import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../agents/llm-agent";
import { Event } from "../events/event";
import { Runner } from "../runners";
import { InMemorySessionService } from "../sessions/in-memory-session-service";

describe("Runner sixth leftover: sync run() error sentinel (post #151)", () => {
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
			appName: "runner-sync-err-app",
			agent,
			sessionService,
		});
	});

	it("sync run() completes empty when runAsync throws; finally still pushes sentinel", async () => {
		await sessionService.createSession(
			"runner-sync-err-app",
			"u1",
			{},
			"s-sync-throw",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(
			// biome-ignore lint/correctness/useYield: error-path mock must throw before yielding
			async function* () {
				throw new Error("agent boom in sync path");
			},
		);

		const rejections: unknown[] = [];
		const onUnhandled = (reason: unknown) => {
			rejections.push(reason);
		};
		process.on("unhandledRejection", onUnhandled);

		try {
			const generator = runner.run({
				userId: "u1",
				sessionId: "s-sync-throw",
				newMessage: { role: "user", parts: [{ text: "go" }] },
			});

			await vi.waitFor(() => {
				expect(rejections.length).toBeGreaterThan(0);
			});

			expect([...generator]).toEqual([]);
			expect(
				rejections.some(
					(r) => r instanceof Error && r.message === "agent boom in sync path",
				),
			).toBe(true);
		} finally {
			process.off("unhandledRejection", onUnhandled);
		}
	});

	it("sync run() yields prior events then ends empty after a mid-stream throw", async () => {
		await sessionService.createSession(
			"runner-sync-err-app",
			"u1",
			{},
			"s-sync-mid-throw",
		);
		vi.spyOn(agent, "runAsync").mockImplementation(async function* () {
			yield new Event({
				author: "root_agent",
				content: { role: "model", parts: [{ text: "before-boom" }] },
			});
			throw new Error("mid-stream boom");
		});

		const rejections: unknown[] = [];
		const onUnhandled = (reason: unknown) => {
			rejections.push(reason);
		};
		process.on("unhandledRejection", onUnhandled);

		try {
			const generator = runner.run({
				userId: "u1",
				sessionId: "s-sync-mid-throw",
				newMessage: { role: "user", parts: [{ text: "go" }] },
			});

			await vi.waitFor(() => {
				expect(rejections.length).toBeGreaterThan(0);
			});

			expect([...generator].map((e) => e.content?.parts?.[0]?.text)).toEqual([
				"before-boom",
			]);
		} finally {
			process.off("unhandledRejection", onUnhandled);
		}
	});

	it("sync run() for missing session ends empty via finally sentinel", async () => {
		const rejections: unknown[] = [];
		const onUnhandled = (reason: unknown) => {
			rejections.push(reason);
		};
		process.on("unhandledRejection", onUnhandled);

		try {
			const generator = runner.run({
				userId: "u1",
				sessionId: "missing-session",
				newMessage: { role: "user", parts: [{ text: "go" }] },
			});

			await vi.waitFor(() => {
				expect(rejections.length).toBeGreaterThan(0);
			});

			expect([...generator]).toEqual([]);
			expect(
				rejections.some(
					(r) =>
						r instanceof Error &&
						/Session not found: missing-session/.test(r.message),
				),
			).toBe(true);
		} finally {
			process.off("unhandledRejection", onUnhandled);
		}
	});
});
