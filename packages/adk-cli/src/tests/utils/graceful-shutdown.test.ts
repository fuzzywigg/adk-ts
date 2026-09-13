import { afterEach, describe, expect, it, vi } from "vitest";
import { createGracefulShutdownHandler } from "../../utils/graceful-shutdown";

describe("createGracefulShutdownHandler", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
		delete process.env.ADK_FORCE_EXIT_MS;
	});

	it("stops the server once and exits with code 0", async () => {
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		const exit = vi
			.spyOn(process, "exit")
			.mockImplementation((() => undefined) as never);
		const stop = vi.fn(async () => undefined);
		const handler = createGracefulShutdownHandler(
			{ stop },
			{ name: "test-server" },
		);

		await handler();
		await handler();

		expect(stop).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledWith(0);
	});

	it("exits with code 1 when stop fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const exit = vi
			.spyOn(process, "exit")
			.mockImplementation((() => undefined) as never);
		const stop = vi.fn(async () => {
			throw new Error("boom");
		});
		const handler = createGracefulShutdownHandler(
			{ stop },
			{ name: "test-server", quiet: true },
		);

		await handler();

		expect(exit).toHaveBeenCalledWith(1);
	});

	it("force-exits after timeout when stop hangs", async () => {
		vi.useFakeTimers();
		process.env.ADK_FORCE_EXIT_MS = "100";
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const exit = vi
			.spyOn(process, "exit")
			.mockImplementation((() => undefined) as never);

		let resolveStop: (() => void) | undefined;
		const stop = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveStop = resolve;
				}),
		);

		const handler = createGracefulShutdownHandler(
			{ stop },
			{ name: "hanging", quiet: true },
		);

		const pending = handler();
		await vi.advanceTimersByTimeAsync(100);

		expect(exit).toHaveBeenCalledWith(1);

		resolveStop?.();
		await pending;
	});
});
