import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Seventeenth leftover: arrayToLines exact maxItems=50/51 omit gate (logger.test
 * only uses 55 → "… 5 more"); objectToLines keyWidth Math.max(6)/Math.min(30)
 * caps (sixth covers 200-key slice, not pad boundaries).
 */
describe("Logger array omit / keyWidth boundary seventeenth leftover", () => {
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
		process.env.NODE_ENV = "production";
		process.env.ADK_DEBUG = "true";
		delete process.env.ADK_FORCE_BOXES;
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.resetModules();
		({ Logger } = await import("../../logger"));
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(originalEnv)) {
			restoreEnvKey(key, value);
		}
		vi.restoreAllMocks();
	});

	it("arrayToLines with exactly 50 items → no omit line", () => {
		const logger = new Logger({ name: "arr-50" });
		const items = Array.from({ length: 50 }, (_, i) => ({ id: i }));
		const lines = (logger as any).arrayToLines(items);
		expect(lines).toHaveLength(50);
		expect(lines[0]).toContain("[1]");
		expect(lines[49]).toContain("[50]");
		expect(lines.some((l: string) => l.includes("more items omitted"))).toBe(
			false,
		);
	});

	it("arrayToLines with 51 items → … 1 more items omitted", () => {
		const logger = new Logger({ name: "arr-51" });
		const items = Array.from({ length: 51 }, (_, i) => ({ id: i }));
		const lines = (logger as any).arrayToLines(items);
		expect(lines).toHaveLength(51);
		expect(lines[49]).toContain("[50]");
		expect(lines[50]).toBe("… 1 more items omitted");
		expect(lines.some((l: string) => l.includes("[51]"))).toBe(false);
	});

	it("objectToLines keyWidth floors at 6 when longest key length is 5", () => {
		const logger = new Logger({ name: "kw-floor" });
		const lines = (logger as any).objectToLines({ abcde: 1 });
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatch(/^abcde : 1$/);
		expect(lines[0].indexOf(":")).toBe(6);
	});

	it("objectToLines keyWidth uses exact 30 when longest key length is 30", () => {
		const logger = new Logger({ name: "kw-exact" });
		const key = "k".repeat(30);
		const lines = (logger as any).objectToLines({ [key]: 2 });
		expect(lines[0]).toMatch(new RegExp(`^${key}: 2$`));
		expect(lines[0].indexOf(":")).toBe(30);
	});

	it("objectToLines keyWidth caps at 30 when longest key length is 31", () => {
		const logger = new Logger({ name: "kw-cap" });
		const key = "k".repeat(31);
		const lines = (logger as any).objectToLines({ [key]: 3 });
		expect(lines[0].startsWith(key)).toBe(true);
		expect(lines[0].indexOf(":")).toBe(31);
		expect(lines[0]).toBe(`${key}: 3`);
		const short = (logger as any).objectToLines({
			[key]: 3,
			a: 0,
		});
		expect(short[1].indexOf(":")).toBe(30);
		expect(short[1]).toMatch(/^a {29}: 0$/);
	});
});
