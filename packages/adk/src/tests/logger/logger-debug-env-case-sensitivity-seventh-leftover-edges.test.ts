import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Logger seventh leftover — ADK_DEBUG === 'true' case asymmetry", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_DEBUG: process.env.ADK_DEBUG,
	};

	let isDebugEnabled: typeof import("../../logger").isDebugEnabled;
	let Logger: typeof import("../../logger").Logger;
	let logSpy: ReturnType<typeof vi.spyOn>;

	function restoreEnvKey(key: string, value: string | undefined): void {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	beforeEach(() => {
		for (const [key, value] of Object.entries(originalEnv)) {
			restoreEnvKey(key, value);
		}
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "debug").mockImplementation(() => {});
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(originalEnv)) {
			restoreEnvKey(key, value);
		}
		vi.restoreAllMocks();
	});

	async function reloadLogger(): Promise<void> {
		vi.resetModules();
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		({ isDebugEnabled, Logger } = await import("../../logger"));
	}

	it.each([
		{ label: "TRUE", value: "TRUE" },
		{ label: "True", value: "True" },
		{ label: "1", value: "1" },
		{ label: "yes", value: "yes" },
		{ label: "empty", value: "" },
		{ label: "true ", value: "true " },
		{ label: "TRUE ", value: "TRUE " },
		{ label: "on", value: "on" },
	] as const)("isDebugEnabled false when NODE_ENV≠development and ADK_DEBUG=$label", async ({
		value,
	}) => {
		process.env.NODE_ENV = "production";
		process.env.ADK_DEBUG = value;
		await reloadLogger();
		expect(isDebugEnabled()).toBe(false);
	});

	it("isDebugEnabled true only for exact ADK_DEBUG='true' outside development", async () => {
		process.env.NODE_ENV = "test";
		process.env.ADK_DEBUG = "true";
		await reloadLogger();
		expect(isDebugEnabled()).toBe(true);
	});

	it("Logger.debug is a no-op when ADK_DEBUG case-mismatches 'true'", async () => {
		process.env.NODE_ENV = "production";
		process.env.ADK_DEBUG = "TRUE";
		await reloadLogger();
		const logger = new Logger({ name: "dbg-case" });
		logger.debug("should-skip");
		expect(logSpy).not.toHaveBeenCalled();
		expect(logger.isDebugEnabled).toBe(false);
	});

	it("Logger.debug emits when ADK_DEBUG is exact 'true'", async () => {
		process.env.NODE_ENV = "production";
		process.env.ADK_DEBUG = "true";
		await reloadLogger();
		const logger = new Logger({ name: "dbg-on" });
		logger.debug("should-emit");
		expect(logSpy).toHaveBeenCalled();
		expect(logger.isDebugEnabled).toBe(true);
	});
});
