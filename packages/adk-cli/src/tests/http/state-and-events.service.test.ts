import { describe, expect, it, vi } from "vitest";
import { StateService } from "../../http/state/state.service";
import { EventsService } from "../../http/events/events.service";
import type { LoadedAgent } from "../../common/types";

describe("StateService", () => {
	it("returns empty state metadata when agent load fails", async () => {
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(null),
			getSessionState: vi.fn(),
			updateSessionState: vi.fn(),
		};
		const service = new StateService(sessionsService as never);

		const state = await service.getState("demo", "s1");
		expect(state.sessionState).toEqual({});
		expect(state.metadata.totalKeys).toBe(0);
		expect(sessionsService.getSessionState).not.toHaveBeenCalled();

		await expect(service.updateState("demo", "s1", "a.b", 1)).resolves.toEqual({
			error: "Failed to load agent",
		});
	});

	it("delegates get/update to SessionsService", async () => {
		const loaded = { sessionId: "s1" } as LoadedAgent;
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(loaded),
			getSessionState: vi.fn().mockResolvedValue({
				agentState: {},
				userState: {},
				sessionState: { x: 1 },
				metadata: {
					lastUpdated: 1,
					changeCount: 0,
					totalKeys: 1,
					sizeBytes: 5,
				},
			}),
			updateSessionState: vi.fn().mockResolvedValue(undefined),
		};
		const service = new StateService(sessionsService as never);

		await expect(service.getState("demo", "s1")).resolves.toEqual(
			expect.objectContaining({ sessionState: { x: 1 } }),
		);
		await expect(service.updateState("demo", "s1", "x", 2)).resolves.toEqual({
			success: true,
		});
		expect(sessionsService.updateSessionState).toHaveBeenCalledWith(
			loaded,
			"s1",
			"x",
			2,
		);
	});

	it("propagates getState results including nested metadata", async () => {
		const loaded = { sessionId: "s2" } as LoadedAgent;
		const payload = {
			agentState: { a: 1 },
			userState: { u: 2 },
			sessionState: { nested: { k: "v" } },
			metadata: {
				lastUpdated: 99,
				changeCount: 3,
				totalKeys: 2,
				sizeBytes: 40,
			},
		};
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(loaded),
			getSessionState: vi.fn().mockResolvedValue(payload),
			updateSessionState: vi.fn(),
		};
		const service = new StateService(sessionsService as never);
		await expect(service.getState("demo", "s2")).resolves.toEqual(payload);
	});
});

describe("EventsService", () => {
	it("returns empty events when agent load fails", async () => {
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(null),
			getSessionEvents: vi.fn(),
		};
		const service = new EventsService(sessionsService as never);
		await expect(service.getEvents("demo", "s1")).resolves.toEqual({
			events: [],
			totalCount: 0,
		});
		expect(sessionsService.getSessionEvents).not.toHaveBeenCalled();
	});

	it("delegates to SessionsService.getSessionEvents", async () => {
		const loaded = { sessionId: "s1" } as LoadedAgent;
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(loaded),
			getSessionEvents: vi.fn().mockResolvedValue({
				events: [{ id: "e1" }],
				totalCount: 1,
			}),
		};
		const service = new EventsService(sessionsService as never);
		await expect(service.getEvents("demo", "s1")).resolves.toEqual({
			events: [{ id: "e1" }],
			totalCount: 1,
		});
		expect(sessionsService.getSessionEvents).toHaveBeenCalledWith(loaded, "s1");
	});

	it("forwards empty event lists from SessionsService", async () => {
		const loaded = { sessionId: "empty" } as LoadedAgent;
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(loaded),
			getSessionEvents: vi.fn().mockResolvedValue({
				events: [],
				totalCount: 0,
			}),
		};
		const service = new EventsService(sessionsService as never);
		await expect(service.getEvents("demo", "empty")).resolves.toEqual({
			events: [],
			totalCount: 0,
		});
	});
});
