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
});
