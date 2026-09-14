import { afterEach, describe, expect, it, vi } from "vitest";
import { createGracefulShutdownHandler } from "../../utils/graceful-shutdown";

describe("graceful-shutdown leftover edges (TOKENMAXX adk-cli)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
		delete process.env.ADK_FORCE_EXIT_MS;
	});

	it("logs the stop banner when quiet is false", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const exit = vi
			.spyOn(process, "exit")
			.mockImplementation((() => undefined) as never);
		const handler = createGracefulShutdownHandler(
			{ stop: vi.fn(async () => undefined) },
			{ name: "api", quiet: false },
		);
		await handler();
		expect(log).toHaveBeenCalledWith(expect.stringContaining("Stopping api"));
		expect(exit).toHaveBeenCalledWith(0);
	});

	it("logs shutdown errors when quiet is false", async () => {
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const exit = vi
			.spyOn(process, "exit")
			.mockImplementation((() => undefined) as never);
		const handler = createGracefulShutdownHandler(
			{
				stop: vi.fn(async () => {
					throw new Error("close failed");
				}),
			},
			{ name: "api", quiet: false },
		);
		await handler();
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("Error during shutdown"),
			expect.any(Error),
		);
		expect(exit).toHaveBeenCalledWith(1);
	});

	it("force-exits with a noisy message after the default timeout", async () => {
		vi.useFakeTimers();
		const error = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const exit = vi
			.spyOn(process, "exit")
			.mockImplementation((() => undefined) as never);
		delete process.env.ADK_FORCE_EXIT_MS;

		let resolveStop: (() => void) | undefined;
		const handler = createGracefulShutdownHandler(
			{
				stop: vi.fn(
					() =>
						new Promise<void>((resolve) => {
							resolveStop = resolve;
						}),
				),
			},
			{ name: "hanging", quiet: false },
		);

		const pending = handler();
		await vi.advanceTimersByTimeAsync(5000);
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("Force exiting after 5000ms"),
		);
		expect(exit).toHaveBeenCalledWith(1);
		resolveStop?.();
		await pending;
	});
});
