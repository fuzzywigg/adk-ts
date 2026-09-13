import { describe, expect, it, vi } from "vitest";
import { ReloadController } from "../../../http/reload/reload.controller";

describe("ReloadController", () => {
	it("sets SSE headers, writes connected frame, and registers client", () => {
		const hotReload = {
			addClient: vi.fn(),
		};
		const res = {
			setHeader: vi.fn(),
			write: vi.fn(() => true),
			end: vi.fn(),
			on: vi.fn(),
		};
		const controller = new ReloadController(hotReload as never);

		controller.stream(res as never);

		expect(res.setHeader).toHaveBeenCalledWith(
			"Content-Type",
			"text/event-stream; charset=utf-8",
		);
		expect(res.setHeader).toHaveBeenCalledWith(
			"Cache-Control",
			"no-cache, no-transform",
		);
		expect(res.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
		expect(res.write).toHaveBeenCalledWith(": connected\n\n");
		expect(hotReload.addClient).toHaveBeenCalledWith(res);
	});

	it("still registers client when initial write throws", () => {
		const hotReload = { addClient: vi.fn() };
		const res = {
			setHeader: vi.fn(),
			write: vi.fn(() => {
				throw new Error("closed");
			}),
			end: vi.fn(),
			on: vi.fn(),
		};
		const controller = new ReloadController(hotReload as never);

		expect(() => controller.stream(res as never)).not.toThrow();
		expect(hotReload.addClient).toHaveBeenCalledWith(res);
	});
});
