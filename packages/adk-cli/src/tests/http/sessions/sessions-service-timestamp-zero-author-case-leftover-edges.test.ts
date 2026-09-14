import { Event, InMemorySessionService } from "@iqai/adk";
import { describe, expect, it, vi } from "vitest";
import type { LoadedAgent } from "../../../common/types";
import { SessionsService } from "../../../http/sessions/sessions.service";

function makeLoaded(overrides: Partial<LoadedAgent> = {}): LoadedAgent {
	return {
		appName: "adk-server",
		userId: "user_demo",
		sessionId: "sess-1",
		agent: { name: "demo" } as LoadedAgent["agent"],
		runner: {} as LoadedAgent["runner"],
		...overrides,
	} as LoadedAgent;
}

/**
 * Leftover: timestamp 0 is falsy for Date.now() fallback; author === "user" is
 * case-sensitive; numeric part.text concatenates; Map keys are case-sensitive.
 */
describe("SessionsService timestamp / author case leftover edges", () => {
	it("replaces timestamp 0 with Date.now() via ||", async () => {
		const sessionService = new InMemorySessionService();
		const loaded = makeLoaded({ sessionId: "t0" });
		const service = new SessionsService(
			{
				getLoadedAgents: vi.fn(() => new Map([["demo", loaded]])),
				startAgent: vi.fn(),
			} as never,
			sessionService,
			true,
		);
		const session = await sessionService.createSession(
			loaded.appName,
			loaded.userId,
			{},
			"t0",
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "user",
				timestamp: 0,
				content: { role: "user", parts: [{ text: "hi" }] },
			}),
		);

		const before = Date.now();
		const messages = await service.getSessionMessages(loaded);
		const after = Date.now();
		const ts = new Date(messages[0].timestamp).getTime();
		expect(ts).toBeGreaterThanOrEqual(before - 50);
		expect(ts).toBeLessThanOrEqual(after + 50);
		expect(messages[0].timestamp).not.toBe(new Date(0).toISOString());
	});

	it("treats User/USER authors as assistant (strict === user)", async () => {
		const sessionService = {
			getSession: vi.fn().mockResolvedValue({
				events: [
					{
						author: "User",
						timestamp: 1,
						content: { parts: [{ text: "a" }] },
					},
					{
						author: "USER",
						timestamp: 1,
						content: { parts: [{ text: "b" }] },
					},
					{
						author: "user",
						timestamp: 1,
						content: { parts: [{ text: "c" }] },
					},
				],
			}),
		};
		const service = new SessionsService(
			{ getLoadedAgents: vi.fn(), startAgent: vi.fn() } as never,
			sessionService as never,
			true,
		);
		const messages = await service.getSessionMessages(makeLoaded());
		expect(messages[0].type).toBe("assistant");
		expect(messages[1].type).toBe("assistant");
		expect(messages[2].type).toBe("user");
	});

	it("keeps empty-string join and concatenates numeric part.text", async () => {
		const sessionService = {
			getSession: vi.fn().mockResolvedValue({
				events: [
					{
						author: "user",
						timestamp: 1,
						content: { parts: [{ text: "" }] },
					},
					{
						author: "demo",
						timestamp: 1,
						content: { parts: [{ text: 0 }] },
					},
					{
						author: "demo",
						timestamp: 1,
						content: { parts: ["not-object", null] },
					},
				],
			}),
		};
		const service = new SessionsService(
			{ getLoadedAgents: vi.fn(), startAgent: vi.fn() } as never,
			sessionService as never,
			true,
		);
		const messages = await service.getSessionMessages(makeLoaded());
		expect(messages[0].content).toBe("");
		expect(messages[1].content).toBe("0");
		expect(messages[2].content).toBe("");
	});

	it("ensureAgentLoaded Map keys are case-sensitive", async () => {
		const loaded = makeLoaded();
		const loadedMap = new Map<string, LoadedAgent>([["Demo", loaded]]);
		const agentManager = {
			getLoadedAgents: vi.fn(() => loadedMap),
			startAgent: vi.fn(async () => {
				throw new Error("nope");
			}),
		};
		const service = new SessionsService(
			agentManager as never,
			new InMemorySessionService(),
			true,
		);

		await expect(service.ensureAgentLoaded("demo")).resolves.toBeNull();
		expect(agentManager.startAgent).toHaveBeenCalledWith("demo");
		await expect(service.ensureAgentLoaded("Demo")).resolves.toBe(loaded);
	});
});
