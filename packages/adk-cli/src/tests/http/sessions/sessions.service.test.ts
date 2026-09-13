import { Event, InMemorySessionService } from "@iqai/adk";
import { describe, expect, it, vi } from "vitest";
import { USER_ID_PREFIX } from "../../../common/constants";
import type { LoadedAgent } from "../../../common/types";
import { SessionsService } from "../../../http/sessions/sessions.service";

function makeLoaded(overrides: Partial<LoadedAgent> = {}): LoadedAgent {
	return {
		appName: "adk-server",
		userId: `${USER_ID_PREFIX}demo`,
		sessionId: "sess-1",
		agent: { name: "demo" } as LoadedAgent["agent"],
		runner: {} as LoadedAgent["runner"],
		...overrides,
	} as LoadedAgent;
}

describe("SessionsService", () => {
	it("ensureAgentLoaded starts missing agents and returns null on failure", async () => {
		const loadedMap = new Map<string, LoadedAgent>();
		const agentManager = {
			getLoadedAgents: vi.fn(() => loadedMap),
			startAgent: vi.fn(async () => {
				throw new Error("boom");
			}),
			getInitialStateForAgent: vi.fn(),
		};
		const service = new SessionsService(
			agentManager as never,
			new InMemorySessionService(),
			true,
		);

		await expect(service.ensureAgentLoaded("demo")).resolves.toBeNull();
		expect(agentManager.startAgent).toHaveBeenCalledWith("demo");

		const loaded = makeLoaded();
		loadedMap.set("demo", loaded);
		await expect(service.ensureAgentLoaded("demo")).resolves.toBe(loaded);
	});

	it("returns empty sessions / errors when agent cannot load", async () => {
		const agentManager = {
			getLoadedAgents: vi.fn(() => new Map()),
			startAgent: vi.fn(async () => {
				throw new Error("missing");
			}),
			getInitialStateForAgent: vi.fn(),
		};
		const service = new SessionsService(
			agentManager as never,
			new InMemorySessionService(),
			true,
		);

		await expect(service.listSessions("demo")).resolves.toEqual({
			sessions: [],
		});
		await expect(service.createSession("demo", {})).resolves.toEqual({
			error: "Failed to load agent",
		});
		await expect(service.deleteSession("demo", "x")).resolves.toEqual({
			error: "Failed to load agent",
		});
		await expect(service.switchSession("demo", "x")).resolves.toEqual({
			error: "Failed to load agent",
		});
	});

	it("lists sessions, maps messages, and computes final-response heuristics", async () => {
		const sessionService = new InMemorySessionService();
		const loaded = makeLoaded({ sessionId: "s1" });
		const agentManager = {
			getLoadedAgents: vi.fn(() => new Map([["demo", loaded]])),
			startAgent: vi.fn(),
			getInitialStateForAgent: vi.fn(() => ({ seeded: true })),
		};
		const hotReload = { broadcastState: vi.fn() };
		const service = new SessionsService(
			agentManager as never,
			sessionService,
			true,
			hotReload as never,
		);

		const session = await sessionService.createSession(
			loaded.appName,
			loaded.userId,
			{ a: 1 },
			"s1",
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "hi" }] },
			}),
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "demo",
				content: {
					role: "model",
					parts: [{ functionCall: { name: "tool", args: {} } }],
				},
			}),
		);
		await sessionService.appendEvent(
			session,
			new Event({
				author: "demo",
				content: { role: "model", parts: [{ text: "done" }] },
			}),
		);

		const listed = await service.listSessions("demo");
		expect(listed.sessions).toHaveLength(1);
		expect(listed.sessions[0].eventCount).toBe(3);

		const messages = await service.getSessionMessages(loaded);
		expect(messages[0]).toEqual(
			expect.objectContaining({ type: "user", content: "hi" }),
		);
		expect(messages[2]).toEqual(
			expect.objectContaining({ type: "assistant", content: "done" }),
		);

		const events = await service.getSessionEvents(loaded, "s1");
		expect(events.totalCount).toBe(3);
		expect(events.events[1].isFinalResponse).toBe(false);
		expect(events.events[2].isFinalResponse).toBe(true);
		expect(events.events[1].functionCalls.length).toBeGreaterThan(0);
	});

	it("maps plain session event objects without Event methods", async () => {
		const sessionService = {
			getSession: vi.fn().mockResolvedValue({
				events: [
					{
						id: "plain-1",
						author: "demo",
						timestamp: Date.now(),
						content: {
							role: "model",
							parts: [{ functionCall: { name: "tool", args: {} } }],
						},
					},
					{
						id: "plain-2",
						author: "demo",
						timestamp: Date.now(),
						content: { role: "model", parts: [{ text: "done" }] },
					},
					{
						id: "plain-3",
						author: "demo",
						timestamp: Date.now(),
						partial: true,
						content: { role: "model", parts: [{ text: "partial" }] },
					},
				],
			}),
		};
		const service = new SessionsService(
			{ getLoadedAgents: vi.fn(), startAgent: vi.fn() } as never,
			sessionService as never,
			true,
		);

		const events = await service.getSessionEvents(makeLoaded(), "s1");
		expect(events.totalCount).toBe(3);
		expect(events.events[0].isFinalResponse).toBe(false);
		expect(events.events[0].functionCalls).toHaveLength(1);
		expect(events.events[1].isFinalResponse).toBe(true);
		expect(events.events[2].isFinalResponse).toBe(false);
	});

	it("creates sessions with agent initial state and broadcasts", async () => {
		const sessionService = new InMemorySessionService();
		const loaded = makeLoaded();
		const agentManager = {
			getLoadedAgents: vi.fn(() => new Map([["demo", loaded]])),
			startAgent: vi.fn(),
			getInitialStateForAgent: vi.fn(() => ({ theme: "dark" })),
		};
		const hotReload = { broadcastState: vi.fn() };
		const service = new SessionsService(
			agentManager as never,
			sessionService,
			true,
			hotReload as never,
		);

		const created = await service.createSession("demo", {});
		expect("error" in created).toBe(false);
		if (!("error" in created)) {
			expect(created.state).toEqual({ theme: "dark" });
			expect(hotReload.broadcastState).toHaveBeenCalledWith("demo", created.id);
		}
	});

	it("updates nested state paths and rejects non-numeric keys on arrays", async () => {
		const sessionService = new InMemorySessionService();
		const loaded = makeLoaded({ sessionId: "nested" });
		const agentManager = {
			getLoadedAgents: vi.fn(() => new Map([["demo", loaded]])),
			startAgent: vi.fn(),
			getInitialStateForAgent: vi.fn(),
		};
		const hotReload = { broadcastState: vi.fn() };
		const service = new SessionsService(
			agentManager as never,
			sessionService,
			true,
			hotReload as never,
		);

		await sessionService.createSession(
			loaded.appName,
			loaded.userId,
			{ user: { prefs: { color: "blue" } }, items: [{ id: 1 }] },
			"nested",
		);

		await service.updateSessionState(
			loaded,
			"nested",
			"user.prefs.color",
			"red",
		);
		await service.updateSessionState(loaded, "nested", "items.0.id", 2);

		const state = await service.getSessionState(loaded, "nested");
		expect(state.sessionState).toEqual({
			user: { prefs: { color: "red" } },
			items: [{ id: 2 }],
		});
		expect(hotReload.broadcastState).toHaveBeenCalled();

		await expect(
			service.updateSessionState(loaded, "nested", "items.name", "x"),
		).rejects.toThrow(/non-numeric key/);
	});

	it("switches sessions and fails for missing ids", async () => {
		const sessionService = new InMemorySessionService();
		const loaded = makeLoaded({ sessionId: "a" });
		const agentManager = {
			getLoadedAgents: vi.fn(() => new Map([["demo", loaded]])),
			startAgent: vi.fn(),
			getInitialStateForAgent: vi.fn(),
		};
		const service = new SessionsService(
			agentManager as never,
			sessionService,
			true,
		);

		await sessionService.createSession(loaded.appName, loaded.userId, {}, "a");
		await sessionService.createSession(loaded.appName, loaded.userId, {}, "b");

		await expect(service.switchSession("demo", "b")).resolves.toEqual({
			success: true,
		});
		expect(loaded.sessionId).toBe("b");
		await expect(service.switchSession("demo", "missing")).rejects.toThrow(
			/Session missing not found/,
		);
	});

	it("deletes sessions and surfaces deleteAgentSession errors", async () => {
		const sessionService = new InMemorySessionService();
		const loaded = makeLoaded({ sessionId: "del-1" });
		const agentManager = {
			getLoadedAgents: vi.fn(() => new Map([["demo", loaded]])),
			startAgent: vi.fn(),
			getInitialStateForAgent: vi.fn(),
		};
		const hotReload = { broadcastState: vi.fn() };
		const service = new SessionsService(
			agentManager as never,
			sessionService,
			true,
			hotReload as never,
		);

		await sessionService.createSession(
			loaded.appName,
			loaded.userId,
			{},
			"del-1",
		);
		await expect(service.deleteSession("demo", "del-1")).resolves.toEqual({
			success: true,
		});
		expect(
			await sessionService.getSession(loaded.appName, loaded.userId, "del-1"),
		).toBeUndefined();

		const failing = new SessionsService(
			agentManager as never,
			{
				deleteSession: vi.fn().mockRejectedValue(new Error("db down")),
			} as never,
			true,
		);
		await expect(failing.deleteSession("demo", "x")).rejects.toThrow(/db down/);
	});

	it("returns empty state/events fallbacks when session lookups fail", async () => {
		const loaded = makeLoaded();
		const service = new SessionsService(
			{ getLoadedAgents: vi.fn(), startAgent: vi.fn() } as never,
			{
				getSession: vi.fn().mockRejectedValue(new Error("boom")),
			} as never,
			true,
		);

		const state = await service.getSessionState(loaded, "missing");
		expect(state.sessionState).toEqual({});
		expect(state.metadata.totalKeys).toBe(0);

		const events = await service.getSessionEvents(loaded, "missing");
		expect(events).toEqual({ events: [], totalCount: 0 });
	});

	it("treats codeExecutionResult parts as non-final for plain events", async () => {
		const sessionService = {
			getSession: vi.fn().mockResolvedValue({
				events: [
					{
						id: "code-1",
						author: "demo",
						timestamp: Date.now(),
						content: {
							role: "model",
							parts: [{ codeExecutionResult: { outcome: "OK" } }],
						},
					},
				],
			}),
		};
		const service = new SessionsService(
			{ getLoadedAgents: vi.fn(), startAgent: vi.fn() } as never,
			sessionService as never,
			true,
		);

		const events = await service.getSessionEvents(makeLoaded(), "s1");
		expect(events.events[0].isFinalResponse).toBe(false);
	});

	it("creates sessions preferring request state over agent initial state", async () => {
		const sessionService = new InMemorySessionService();
		const loaded = makeLoaded();
		const agentManager = {
			getLoadedAgents: vi.fn(() => new Map([["demo", loaded]])),
			startAgent: vi.fn(),
			getInitialStateForAgent: vi.fn(() => ({ theme: "dark", keep: true })),
		};
		const service = new SessionsService(
			agentManager as never,
			sessionService,
			true,
		);

		const created = await service.createSession("demo", {
			state: { theme: "light", extra: 1 },
		});
		expect("error" in created).toBe(false);
		if (!("error" in created)) {
			expect(created.state).toEqual({ theme: "light", extra: 1 });
			expect(agentManager.getInitialStateForAgent).not.toHaveBeenCalled();
		}
	});

	it("rejects updateSessionState when the session is missing", async () => {
		const sessionService = new InMemorySessionService();
		const loaded = makeLoaded({ sessionId: "gone" });
		const service = new SessionsService(
			{
				getLoadedAgents: vi.fn(() => new Map([["demo", loaded]])),
				startAgent: vi.fn(),
				getInitialStateForAgent: vi.fn(),
			} as never,
			sessionService,
			true,
		);

		await expect(
			service.updateSessionState(loaded, "gone", "a.b", 1),
		).rejects.toThrow(/Session not found/);
	});
});
