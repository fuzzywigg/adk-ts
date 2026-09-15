import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Nineteenth leftover residual after tip #261 / #253:
 * #261 pinned objectToLines `obj || {}` + property stringify via arrayToLines
 * of real arrays. Residual: arrayToLines top-level `!items.length` — true/1/
 * ±Infinity/-0/[] → "(empty list)"; string `"true"` has length then throws
 * on `.map` (slice returns string).
 */
describe("Logger arrayToLines top-level true/string-true throw nineteenth leftover", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_DEBUG: process.env.ADK_DEBUG,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
	};

	let Logger: typeof import("../../logger").Logger;

	function restoreEnvKey(key: string, value: string | undefined): void {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	beforeEach(async () => {
		for (const [key, value] of Object.entries(originalEnv)) {
			restoreEnvKey(key, value);
		}
		process.env.NODE_ENV = "development";
		process.env.ADK_DEBUG = "true";
		delete process.env.ADK_FORCE_BOXES;
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.resetModules();
		({ Logger } = await import("../../logger"));
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(originalEnv)) {
			restoreEnvKey(key, value);
		}
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "boolean true", items: true },
		{ label: "number 1", items: 1 },
		{ label: "Infinity", items: Number.POSITIVE_INFINITY },
		{ label: "-Infinity", items: Number.NEGATIVE_INFINITY },
		{ label: "-0", items: -0 },
		{ label: "empty array", items: [] },
	] as const)("arrayToLines($label) → (empty list) via !items.length", ({
		items,
	}) => {
		const logger = new Logger({ name: "arr-top" });
		expect((logger as any).arrayToLines(items)).toEqual(["(empty list)"]);
	});

	it('arrayToLines("true") throws (length truthy → slice string has no .map)', () => {
		const logger = new Logger({ name: "arr-str-true" });
		expect(() => (logger as any).arrayToLines("true")).toThrow(
			/map is not a function/,
		);
	});
});
