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
 * Leftover: `if (!stateToUse)` treats null/0/false/"" as missing (unlike {} which
 * is truthy and skips agent initial — covered by #199 leftover).
 */
describe("SessionsService falsy stateToUse gate leftover edges", () => {
	it.each([
		null,
		0,
		false,
		"",
	] as const)("state %j falls through to agent initial state", async (state) => {
		const sessionService = new InMemorySessionService();
		const loaded = makeLoaded();
		const agentManager = {
			getLoadedAgents: vi.fn(() => new Map([["demo", loaded]])),
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
			state: state as never,
		});
		expect(agentManager.getInitialStateForAgent).toHaveBeenCalled();
		expect(created.state).toEqual({ fromAgent: true });
		expect(hotReload.broadcastState).toHaveBeenCalled();
	});
});
