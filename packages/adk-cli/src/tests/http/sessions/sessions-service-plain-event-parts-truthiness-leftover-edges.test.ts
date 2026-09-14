import { describe, expect, it, vi } from "vitest";
import type { LoadedAgent } from "../../../common/types";
import { SessionsService } from "../../../http/sessions/sessions.service";

function makeLoaded(): LoadedAgent {
	return {
		appName: "adk-server",
		userId: "user_demo",
		sessionId: "s1",
		agent: { name: "demo" } as LoadedAgent["agent"],
		runner: {} as LoadedAgent["runner"],
	} as LoadedAgent;
}

/**
 * Leftover: part && skips 0/""; empty {} is final; non-function getFunctionCalls
 * uses plain filter; events: undefined hits !session.events early return.
 */
describe("SessionsService plain event parts leftover edges", () => {
	it("skips falsy parts and treats empty {} as final", async () => {
		const sessionService = {
			getSession: vi.fn().mockResolvedValue({
				events: [
					{
						id: "plain-empty",
						author: "demo",
						timestamp: 1,
						content: { role: "model", parts: [0, "", null, {}] },
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
		expect(events.events[0].functionCalls).toEqual([]);
		expect(events.events[0].isFinalResponse).toBe(true);
	});

	it("functionResponse parts make isFinalResponse false", async () => {
		const sessionService = {
			getSession: vi.fn().mockResolvedValue({
				events: [
					{
						id: "fr",
						author: "demo",
						timestamp: 1,
						content: {
							role: "model",
							parts: [{ functionResponse: { name: "tool", response: {} } }],
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
		expect(events.events[0].functionResponses).toHaveLength(1);
		expect(events.events[0].isFinalResponse).toBe(false);
	});

	it("non-function getFunctionCalls falls through to plain part filter", async () => {
		const sessionService = {
			getSession: vi.fn().mockResolvedValue({
				events: [
					{
						id: "not-fn",
						author: "demo",
						timestamp: 1,
						getFunctionCalls: "not-a-function",
						content: {
							role: "model",
							parts: [{ functionCall: { name: "tool", args: {} } }],
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
		expect(events.events[0].functionCalls).toHaveLength(1);
		expect(events.events[0].isFinalResponse).toBe(false);
	});

	it("events: undefined early-returns empty payload", async () => {
		const sessionService = {
			getSession: vi.fn().mockResolvedValue({ events: undefined }),
		};
		const service = new SessionsService(
			{ getLoadedAgents: vi.fn(), startAgent: vi.fn() } as never,
			sessionService as never,
			true,
		);
		await expect(service.getSessionEvents(makeLoaded(), "s1")).resolves.toEqual(
			{
				events: [],
				totalCount: 0,
			},
		);
	});
});
