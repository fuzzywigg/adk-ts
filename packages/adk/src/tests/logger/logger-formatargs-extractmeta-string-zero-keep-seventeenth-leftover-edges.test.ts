import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Seventeenth leftover: formatArgs/extractMeta `!arg` keeps truthy strings
 * `"0"`/`"false"` in otherArgs / meta.suggestion (fifteenth skipped NaN;
 * seventh skipped falsy 0/false/""). Contrast numeric 0 still skipped.
 */
describe("Logger formatArgs/extractMeta string-zero keep seventeenth leftover", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
	};

	let Logger: typeof import("../../logger").Logger;
	let debugSpy: ReturnType<typeof vi.spyOn>;
	let warnSpy: ReturnType<typeof vi.spyOn>;

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
		delete process.env.ADK_FORCE_BOXES;
		debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	] as const)("info keeps truthy string arg $label via !arg gate", ({
		value,
	}) => {
		const logger = new Logger({ name: "str-keep" });
		logger.info("m", value, { x: 1 });
		const rendered = stripAnsi(String(debugSpy.mock.calls[0][0]));
		expect(rendered).toContain(`• ${value}`);
		expect(rendered).toContain('"x":1');
	});

	it("info skips numeric 0 via !arg (contrast string keep)", () => {
		const logger = new Logger({ name: "num-skip" });
		logger.info("m", 0, { x: 1 });
		const rendered = stripAnsi(String(debugSpy.mock.calls[0][0]));
		expect(rendered).toContain('"x":1');
		expect(rendered).not.toContain("• 0");
	});

	it.each([
		{ label: '"0"', suggestion: "0" },
		{ label: '"false"', suggestion: "false" },
	] as const)("warn extractMeta keeps suggestion=$label (truthy string)", ({
		suggestion,
	}) => {
		const logger = new Logger({ name: "meta-sug" });
		logger.warn("hinted", { suggestion });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain(`• Suggestion: ${suggestion}`);
	});
});
