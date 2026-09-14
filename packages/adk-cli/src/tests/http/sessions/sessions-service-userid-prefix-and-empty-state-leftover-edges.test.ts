import { InMemorySessionService } from "@iqai/adk";
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

/**
 * Leftover: user_ prefix stripped once; startsWith is case-sensitive;
 * request state {} is truthy (skip agent initial, no broadcast);
 * { n: 0 } still broadcasts.
 */
describe("SessionsService userId prefix / empty state leftover edges", () => {
	it("strips user_ once so user_user_demo maps to user_demo", async () => {
		const sessionService = new InMemorySessionService();
		const loaded = makeLoaded({ userId: "user_user_demo" });
		const agentManager = {
			getLoadedAgents: vi.fn(() => new Map([["user_demo", loaded]])),
			startAgent: vi.fn(),
			getInitialStateForAgent: vi.fn(() => ({ fromAgent: true })),
		};
		const hotReload = { broadcastState: vi.fn() };
		const service = new SessionsService(
			agentManager as never,
			sessionService,
			true,
			hotReload as never,
		);

		const created = await service.createAgentSession(loaded, {
			state: { n: 1 },
		});
		expect(hotReload.broadcastState).toHaveBeenCalledWith(
			"user_demo",
			created.id,
		);
	});

	it("does not strip User_ prefix (case-sensitive startsWith)", async () => {
		const sessionService = new InMemorySessionService();
		const loaded = makeLoaded({ userId: "User_demo" });
		const hotReload = { broadcastState: vi.fn() };
		const service = new SessionsService(
			{
				getLoadedAgents: vi.fn(),
				startAgent: vi.fn(),
				getInitialStateForAgent: vi.fn(),
			} as never,
			sessionService,
			true,
			hotReload as never,
		);

		const created = await service.createAgentSession(loaded, {
			state: { n: 1 },
		});
		expect(hotReload.broadcastState).toHaveBeenCalledWith(
			"User_demo",
			created.id,
		);
	});

	it("request state {} skips agent initial and does not broadcast", async () => {
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

		const created = await service.createAgentSession(loaded, { state: {} });
		expect(created.state).toEqual({});
		expect(agentManager.getInitialStateForAgent).not.toHaveBeenCalled();
		expect(hotReload.broadcastState).not.toHaveBeenCalled();
	});

	it("request state { n: 0 } broadcasts because keys.length > 0", async () => {
		const sessionService = new InMemorySessionService();
		const loaded = makeLoaded();
		const hotReload = { broadcastState: vi.fn() };
		const service = new SessionsService(
			{
				getLoadedAgents: vi.fn(),
				startAgent: vi.fn(),
				getInitialStateForAgent: vi.fn(),
			} as never,
			sessionService,
			true,
			hotReload as never,
		);

		const created = await service.createAgentSession(loaded, {
			state: { n: 0 },
		});
		expect(created.state).toEqual({ n: 0 });
		expect(hotReload.broadcastState).toHaveBeenCalledWith("demo", created.id);
	});

	it("getSessionState keeps empty object via || (does not replace {})", async () => {
		const sessionService = new InMemorySessionService();
		const loaded = makeLoaded({ sessionId: "empty" });
		const service = new SessionsService(
			{ getLoadedAgents: vi.fn(), startAgent: vi.fn() } as never,
			sessionService,
			true,
		);
		await sessionService.createSession(
			loaded.appName,
			loaded.userId,
			{},
			"empty",
		);
		const state = await service.getSessionState(loaded, "empty");
		expect(state.sessionState).toEqual({});
	});
});
