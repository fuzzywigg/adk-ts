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
 * Leftover: content?.parts?.map.join || "" tolerates undefined content/parts;
 * session.state || {} coerces null (contrast: {} kept — #199 leftover).
 */
describe("SessionsService message parts / state null leftover edges", () => {
	it("undefined content and parts yield empty message content", async () => {
		const sessionService = {
			getSession: vi.fn().mockResolvedValue({
				events: [
					{ author: "user", timestamp: 1, content: undefined },
					{ author: "assistant", timestamp: 2, content: { parts: undefined } },
				],
			}),
		};
		const service = new SessionsService(
			{ getLoadedAgents: vi.fn(), startAgent: vi.fn() } as never,
			sessionService as never,
			true,
		);

		const messages = await service.getSessionMessages(makeLoaded());
		expect(messages).toHaveLength(2);
		expect(messages[0].content).toBe("");
		expect(messages[1].content).toBe("");
	});

	it("session.state null becomes {} via ||", async () => {
		const sessionService = {
			getSession: vi.fn().mockResolvedValue({
				state: null,
				lastUpdateTime: 1,
				events: [],
			}),
		};
		const service = new SessionsService(
			{ getLoadedAgents: vi.fn(), startAgent: vi.fn() } as never,
			sessionService as never,
			true,
		);

		const result = await service.getSessionState(makeLoaded(), "sess-1");
		expect(result.sessionState).toEqual({});
	});
});
