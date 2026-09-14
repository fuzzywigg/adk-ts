import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Fifteenth leftover: formatArgs/extractMeta `!arg` skips NaN; formatBox wrap
 * hard-cuts when lastSpace === -1 (no spaces); NODE_ENV=development OR-wins
 * over junk ADK_DEBUG values.
 */
describe("Logger formatArgs NaN / wrap nospace / debug OR fifteenth leftover", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_DEBUG: process.env.ADK_DEBUG,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
	};
	const originalColumns = process.stdout.columns;

	let Logger: typeof import("../../logger").Logger;
	let isDebugEnabled: typeof import("../../logger").isDebugEnabled;
	let debugSpy: ReturnType<typeof vi.spyOn>;
	let logSpy: ReturnType<typeof vi.spyOn>;

	function restoreEnvKey(key: string, value: string | undefined): void {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	async function reloadLogger(): Promise<void> {
		vi.resetModules();
		debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		({ Logger, isDebugEnabled } = await import("../../logger"));
	}

	beforeEach(async () => {
		for (const [key, value] of Object.entries(originalEnv)) {
			restoreEnvKey(key, value);
		}
		process.stdout.columns = 120;
		delete process.env.ADK_FORCE_BOXES;
		await reloadLogger();
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(originalEnv)) {
			restoreEnvKey(key, value);
		}
		process.stdout.columns = originalColumns;
		vi.restoreAllMocks();
	});

	it("formatArgs/extractMeta skip NaN via !arg (keeps later object arg)", () => {
		process.env.NODE_ENV = "production";
		delete process.env.ADK_DEBUG;
		const logger = new Logger({ name: "nan-skip" });
		logger.info("keep", Number.NaN, { x: 1 });
		const rendered = stripAnsi(String(debugSpy.mock.calls[0][0]));
		expect(rendered).toContain("keep");
		expect(rendered).toContain('"x":1');
		expect(rendered).not.toContain("• NaN");
		expect(rendered).not.toMatch(/•\s*null/);
	});

	it("formatBox wrap hard-cuts continuous text when lastSpace === -1", () => {
		process.env.NODE_ENV = "development";
		process.stdout.columns = 50;
		const logger = new Logger({ name: "wrap-nospace" });
		const pad = 1;
		const maxWidthPct = 0.9;
		const maxWidth = Math.floor(50 * maxWidthPct);
		const actualMaxContent = maxWidth - 2 - pad * 2;
		const continuous = "a".repeat(actualMaxContent + 20);

		const out = stripAnsi(
			logger.formatBox({
				title: "T",
				description: "d",
				lines: [continuous],
				width: 20,
				maxWidthPct,
				wrap: true,
				pad,
			}),
		);

		const bodyLines = out
			.split("\n")
			.filter((line) => line.includes("│") && /a/.test(line));
		expect(bodyLines.length).toBeGreaterThan(1);
		const firstPlain = bodyLines[0].replace(/[│ ]/g, "");
		expect(firstPlain.length).toBeLessThanOrEqual(actualMaxContent);
		expect(firstPlain).toBe("a".repeat(actualMaxContent));
	});

	it.each([
		{ label: "FALSE", value: "FALSE" },
		{ label: "TRUE", value: "TRUE" },
		{ label: "0", value: "0" },
		{ label: "empty", value: "" },
	] as const)("NODE_ENV=development OR-wins over ADK_DEBUG=$label junk", async ({
		value,
	}) => {
		process.env.NODE_ENV = "development";
		process.env.ADK_DEBUG = value;
		await reloadLogger();
		expect(isDebugEnabled()).toBe(true);
		const logger = new Logger({ name: "dev-or" });
		expect(logger.isDebugEnabled).toBe(true);
		logger.debug("emit-me");
		expect(logSpy).toHaveBeenCalled();
		const rendered = stripAnsi(String(logSpy.mock.calls[0][0]));
		expect(rendered).toContain("emit-me");
	});
});
