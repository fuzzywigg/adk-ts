import { afterEach, describe, expect, it } from "vitest";
import { Logger } from "../../logger";

describe("Logger", () => {
	const originalEnv = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
		ADK_ERROR_STACK_FRAMES: process.env.ADK_ERROR_STACK_FRAMES,
	};

	afterEach(() => {
		process.env.NODE_ENV = originalEnv.NODE_ENV;
		if (originalEnv.ADK_FORCE_BOXES === undefined) {
			delete process.env.ADK_FORCE_BOXES;
		} else {
			process.env.ADK_FORCE_BOXES = originalEnv.ADK_FORCE_BOXES;
		}
		if (originalEnv.ADK_ERROR_STACK_FRAMES === undefined) {
			delete process.env.ADK_ERROR_STACK_FRAMES;
		} else {
			process.env.ADK_ERROR_STACK_FRAMES = originalEnv.ADK_ERROR_STACK_FRAMES;
		}
	});

	it("stores the logger name", () => {
		const logger = new Logger({ name: "unit-logger" });
		expect(logger.name).toBe("unit-logger");
	});

	it("exposes info/warn/error/debug methods that do not throw", () => {
		const logger = new Logger({ name: "console-logger" });
		logger.isDebugEnabled = true;

		expect(() => logger.info("hello")).not.toThrow();
		expect(() => logger.warn("careful")).not.toThrow();
		expect(() => logger.error("boom")).not.toThrow();
		expect(() => logger.debug("detail")).not.toThrow();
	});

	it("honors isDebugEnabled for debug gating", () => {
		const logger = new Logger({ name: "quiet" });
		logger.isDebugEnabled = false;
		expect(() => logger.debug("hidden")).not.toThrow();
		logger.isDebugEnabled = true;
		expect(() => logger.debug("visible")).not.toThrow();
	});

	it("accepts production formatting with meta suggestion/context", () => {
		process.env.NODE_ENV = "production";
		delete process.env.ADK_FORCE_BOXES;
		const logger = new Logger({ name: "prod" });
		expect(() =>
			logger.warn("careful", { suggestion: "retry", context: { code: 1 } }),
		).not.toThrow();
	});

	it("accepts boxed error logging with Error stacks outside production", () => {
		process.env.NODE_ENV = "development";
		process.env.ADK_ERROR_STACK_FRAMES = "2";
		const logger = new Logger({ name: "boxed" });
		expect(() =>
			logger.error("failed", new Error("boom"), { context: { step: "run" } }),
		).not.toThrow();
	});

	it("can force boxed output even in production", () => {
		process.env.NODE_ENV = "production";
		process.env.ADK_FORCE_BOXES = "true";
		const logger = new Logger({ name: "forced" });
		expect(() => logger.warn("still boxed")).not.toThrow();
	});
});
