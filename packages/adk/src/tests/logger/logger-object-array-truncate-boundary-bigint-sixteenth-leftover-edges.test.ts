import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Sixteenth leftover: objectToLines uses `length > 140` (keep 140 / truncate
 * 141); arrayToLines uses `length > 160` (keep 160 / truncate 161). Logger
 * stringify catch path keeps BigInt via String(value) — LogFormatter throws.
 */
describe("Logger object/array truncate boundary + bigint sixteenth leftover", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_DEBUG: process.env.ADK_DEBUG,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
	};

	let Logger: typeof import("../../logger").Logger;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let debugSpy: ReturnType<typeof vi.spyOn>;

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
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
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

	it("objectToLines keeps value length 140; truncates 141 to 139+…", () => {
		const logger = new Logger({ name: "obj-bound" });
		const keep = "x".repeat(140);
		const over = "y".repeat(141);
		const lines = (logger as any).objectToLines({ keep, over });
		expect(lines.find((l: string) => l.startsWith("keep"))).toContain(keep);
		expect(lines.find((l: string) => l.startsWith("keep"))).not.toContain("…");
		const overLine = lines.find((l: string) => l.startsWith("over"));
		expect(overLine).toContain(`${"y".repeat(139)}…`);
		expect(overLine).not.toContain("y".repeat(140));
	});

	it("arrayToLines keeps prop length 160; truncates 161 to 159+…", () => {
		const logger = new Logger({ name: "arr-bound" });
		const keep = "a".repeat(160);
		const over = "b".repeat(161);
		const lines = (logger as any).arrayToLines([{ keep, over }]);
		expect(lines[0]).toContain(`keep=${keep}`);
		expect(lines[0]).toContain(`over=${"b".repeat(159)}…`);
		expect(lines[0]).not.toContain("b".repeat(160));
	});

	it("debugStructured / debugArray surface truncate via prod simple formatBox", () => {
		process.env.NODE_ENV = "production";
		delete process.env.ADK_FORCE_BOXES;
		process.env.ADK_DEBUG = "true";
		const logger = new Logger({ name: "dbg-bound" });
		logger.debugStructured("obj", { v: "z".repeat(141) });
		const objOut = stripAnsi(String(logSpy.mock.calls[0][0]));
		expect(objOut).toContain(`${"z".repeat(139)}…`);
		expect(objOut).not.toContain("┌");

		logger.debugArray("arr", [{ p: "q".repeat(161) }]);
		const arrOut = stripAnsi(String(logSpy.mock.calls[1][0]));
		expect(arrOut).toContain(`p=${"q".repeat(159)}…`);
		expect(arrOut).not.toContain("┌");
	});

	it("stringify catch path keeps BigInt via String(value) without throw", () => {
		process.env.NODE_ENV = "production";
		delete process.env.ADK_FORCE_BOXES;
		const logger = new Logger({ name: "bigint-ok" });
		expect(() => logger.info("n", { n: BigInt(10) })).not.toThrow();
		const rendered = stripAnsi(String(debugSpy.mock.calls[0][0]));
		expect(rendered).toContain("n");
		expect(rendered).toMatch(/10n|\[object Object\]|BigInt/);
	});
});
