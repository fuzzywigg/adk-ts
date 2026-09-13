import { describe, expect, it, vi } from "vitest";
import { EventsService } from "../../../http/events/events.service";
import type { SessionsService } from "../../../http/sessions/sessions.service";

describe("EventsService", () => {
	it("returns empty events when the agent fails to load", async () => {
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(null),
			getSessionEvents: vi.fn(),
		} as unknown as SessionsService;

		const service = new EventsService(sessionsService);
		await expect(service.getEvents("/agents/demo", "sess-1")).resolves.toEqual({
			events: [],
			totalCount: 0,
		});
		expect(sessionsService.ensureAgentLoaded).toHaveBeenCalledWith(
			"/agents/demo",
		);
		expect(sessionsService.getSessionEvents).not.toHaveBeenCalled();
	});

	it("delegates to getSessionEvents when the agent loads", async () => {
		const loaded = { agentPath: "/agents/demo" };
		const payload = {
			events: [{ id: "e1", author: "user", timestamp: 1 }],
			totalCount: 1,
		};
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(loaded),
			getSessionEvents: vi.fn().mockResolvedValue(payload),
		} as unknown as SessionsService;

		const service = new EventsService(sessionsService);
		await expect(service.getEvents("/agents/demo", "sess-9")).resolves.toBe(
			payload,
		);
		expect(sessionsService.getSessionEvents).toHaveBeenCalledWith(
			loaded,
			"sess-9",
		);
	});
});
