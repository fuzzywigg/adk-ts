import { describe, expect, it, vi } from "vitest";
import { StateController } from "../../../http/state/state.controller";

describe("StateController", () => {
	it("decodes agent id and returns session state", async () => {
		const state = {
			getState: vi.fn(async () => ({ state: { a: 1 }, size: 1 })),
			updateState: vi.fn(),
		};
		const controller = new StateController(state as never);

		await expect(
			controller.getState(encodeURIComponent("/agents/demo"), "s1"),
		).resolves.toEqual({ state: { a: 1 }, size: 1 });
		expect(state.getState).toHaveBeenCalledWith("/agents/demo", "s1");
	});

	it("unpacks path and value from update body", async () => {
		const state = {
			getState: vi.fn(),
			updateState: vi.fn(async () => ({ success: true })),
		};
		const controller = new StateController(state as never);

		await expect(
			controller.updateState(encodeURIComponent("/agents/demo"), "s1", {
				path: "user.theme",
				value: "dark",
			}),
		).resolves.toEqual({ success: true });
		expect(state.updateState).toHaveBeenCalledWith(
			"/agents/demo",
			"s1",
			"user.theme",
			"dark",
		);
	});

	it("decodes nested agent paths for get and update", async () => {
		const state = {
			getState: vi.fn(async () => ({ ok: true })),
			updateState: vi.fn(async () => ({ success: true })),
		};
		const controller = new StateController(state as never);
		const encoded = encodeURIComponent("/agents/nested/path");

		await controller.getState(encoded, "sess");
		await controller.updateState(encoded, "sess", {
			path: "session.counter",
			value: 3,
		});

		expect(state.getState).toHaveBeenCalledWith("/agents/nested/path", "sess");
		expect(state.updateState).toHaveBeenCalledWith(
			"/agents/nested/path",
			"sess",
			"session.counter",
			3,
		);
	});

	it("forwards update errors from the service", async () => {
		const state = {
			getState: vi.fn(),
			updateState: vi.fn(async () => ({ error: "Failed to load agent" })),
		};
		const controller = new StateController(state as never);

		await expect(
			controller.updateState(encodeURIComponent("/agents/x"), "s1", {
				path: "a",
				value: 1,
			}),
		).resolves.toEqual({ error: "Failed to load agent" });
	});
});
