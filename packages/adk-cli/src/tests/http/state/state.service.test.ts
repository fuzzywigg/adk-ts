import { describe, expect, it, vi } from "vitest";
import { StateService } from "../../../http/state/state.service";

describe("StateService", () => {
	it("returns empty state payload when agent fails to load", async () => {
		const sessions = {
			ensureAgentLoaded: vi.fn(async () => null),
			getSessionState: vi.fn(),
			updateSessionState: vi.fn(),
		};
		const service = new StateService(sessions as never);

		const result = await service.getState("/agents/missing", "s1");
		expect(result.agentState).toEqual({});
		expect(result.userState).toEqual({});
		expect(result.sessionState).toEqual({});
		expect(result.metadata.changeCount).toBe(0);
		expect(result.metadata.totalKeys).toBe(0);
		expect(sessions.getSessionState).not.toHaveBeenCalled();
	});

	it("delegates getState to sessions when agent is loaded", async () => {
		const loaded = { agent: { name: "demo" } };
		const sessions = {
			ensureAgentLoaded: vi.fn(async () => loaded),
			getSessionState: vi.fn(async () => ({
				agentState: { a: 1 },
				userState: {},
				sessionState: { b: 2 },
				metadata: {
					lastUpdated: 1,
					changeCount: 2,
					totalKeys: 2,
					sizeBytes: 10,
				},
			})),
			updateSessionState: vi.fn(),
		};
		const service = new StateService(sessions as never);

		await expect(service.getState("/agents/demo", "s1")).resolves.toEqual({
			agentState: { a: 1 },
			userState: {},
			sessionState: { b: 2 },
			metadata: {
				lastUpdated: 1,
				changeCount: 2,
				totalKeys: 2,
				sizeBytes: 10,
			},
		});
		expect(sessions.getSessionState).toHaveBeenCalledWith(loaded, "s1");
	});

	it("returns error when update cannot load agent", async () => {
		const sessions = {
			ensureAgentLoaded: vi.fn(async () => null),
			getSessionState: vi.fn(),
			updateSessionState: vi.fn(),
		};
		const service = new StateService(sessions as never);

		await expect(
			service.updateState("/agents/missing", "s1", "user.theme", "dark"),
		).resolves.toEqual({ error: "Failed to load agent" });
		expect(sessions.updateSessionState).not.toHaveBeenCalled();
	});

	it("updates session state when agent is loaded", async () => {
		const loaded = { agent: { name: "demo" } };
		const sessions = {
			ensureAgentLoaded: vi.fn(async () => loaded),
			getSessionState: vi.fn(),
			updateSessionState: vi.fn(async () => undefined),
		};
		const service = new StateService(sessions as never);

		await expect(
			service.updateState("/agents/demo", "s1", "user.theme", "dark"),
		).resolves.toEqual({ success: true });
		expect(sessions.updateSessionState).toHaveBeenCalledWith(
			loaded,
			"s1",
			"user.theme",
			"dark",
		);
	});
});
