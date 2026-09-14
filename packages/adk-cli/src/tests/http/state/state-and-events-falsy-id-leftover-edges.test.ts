import { describe, expect, it, vi } from "vitest";
import { EventsController } from "../../../http/events/events.controller";
import { EventsService } from "../../../http/events/events.service";
import { StateController } from "../../../http/state/state.controller";
import { StateService } from "../../../http/state/state.service";

/**
 * Leftover: empty agentPath still goes through ensureAgentLoaded;
 * value 0 is forwarded; decodeURIComponent preserves case (no toLowerCase).
 */
describe("state / events falsy id leftover edges", () => {
	it("StateService empty agentPath returns empty payload when load fails", async () => {
		const sessions = {
			ensureAgentLoaded: vi.fn(async () => null),
			getSessionState: vi.fn(),
			updateSessionState: vi.fn(),
		};
		const service = new StateService(sessions as never);
		const before = Date.now() / 1000;
		const result = await service.getState("", "s1");
		const after = Date.now() / 1000;
		expect(result.sessionState).toEqual({});
		expect(result.metadata.lastUpdated).toBeGreaterThanOrEqual(before);
		expect(result.metadata.lastUpdated).toBeLessThanOrEqual(after);
		expect(result.metadata.lastUpdated).not.toBe(0);
		expect(sessions.ensureAgentLoaded).toHaveBeenCalledWith("");
	});

	it("StateService updateState forwards value 0", async () => {
		const loaded = { agent: { name: "demo" } };
		const sessions = {
			ensureAgentLoaded: vi.fn(async () => loaded),
			getSessionState: vi.fn(),
			updateSessionState: vi.fn(async () => undefined),
		};
		const service = new StateService(sessions as never);
		await expect(
			service.updateState("/agents/demo", "s1", "count", 0),
		).resolves.toEqual({ success: true });
		expect(sessions.updateSessionState).toHaveBeenCalledWith(
			loaded,
			"s1",
			"count",
			0,
		);
	});

	it("EventsService empty agentPath returns empty events", async () => {
		const sessions = {
			ensureAgentLoaded: vi.fn(async () => null),
			getSessionEvents: vi.fn(),
		};
		const service = new EventsService(sessions as never);
		await expect(service.getEvents("", "")).resolves.toEqual({
			events: [],
			totalCount: 0,
		});
		expect(sessions.ensureAgentLoaded).toHaveBeenCalledWith("");
	});

	it("controllers preserve case through decodeURIComponent", async () => {
		const state = {
			getState: vi.fn(async () => ({ ok: true })),
			updateState: vi.fn(async () => ({ success: true })),
		};
		const events = {
			getEvents: vi.fn(async () => ({ events: [], totalCount: 0 })),
		};
		const stateController = new StateController(state as never);
		const eventsController = new EventsController(events as never);
		const encoded = encodeURIComponent("/agents/Demo");

		await stateController.getState(encoded, "");
		await eventsController.getEvents(encoded, "");

		expect(state.getState).toHaveBeenCalledWith("/agents/Demo", "");
		expect(events.getEvents).toHaveBeenCalledWith("/agents/Demo", "");
	});
});
