import { describe, expect, it } from "vitest";
import { Logger } from "../../logger";

describe("Logger", () => {
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
});
