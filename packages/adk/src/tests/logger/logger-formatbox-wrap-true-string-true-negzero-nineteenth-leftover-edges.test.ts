import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Nineteenth leftover residual deepen after tip #279 / 3a81cea:
 * sixteenth/seventeenth pinned wrap soft-cut / nowrap truncate with boolean
 * wrap only. Residual: `!wrap` truthiness for `"true"`/`[]`/`1` (wrap path)
 * vs SameValueZero `-0` (nowrap truncate).
 */
describe("Logger formatBox wrap true/string-true/negzero nineteenth leftover", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
	};
	const originalColumns = process.stdout.columns;

	let Logger: typeof import("../../logger").Logger;

	function restoreEnvKey(key: string, value: string | undefined): void {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	function maxContentFor(
		columns: number,
		pad: number,
		maxWidthPct: number,
	): number {
		const maxWidth = Math.floor(columns * maxWidthPct);
		return maxWidth - 2 - pad * 2;
	}

	beforeEach(async () => {
		for (const [key, value] of Object.entries(originalEnv)) {
			restoreEnvKey(key, value);
		}
		process.stdout.columns = 50;
		process.env.NODE_ENV = "development";
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
		process.stdout.columns = originalColumns;
		vi.restoreAllMocks();
	});

	it.each([
		{ label: '"true"', wrap: "true" },
		{ label: "empty array", wrap: [] },
		{ label: "number 1", wrap: 1 },
	] as const)("wrap=$label takes wrap path (multi-line, no ellipsis)", ({
		wrap,
	}) => {
		const logger = new Logger({ name: "wrap-true" });
		const pad = 1;
		const maxWidthPct = 0.9;
		const maxContent = maxContentFor(50, pad, maxWidthPct);
		const long = `${"word ".repeat(20)}tail`;

		const out = stripAnsi(
			logger.formatBox({
				title: "Title",
				description: "Desc",
				lines: [long],
				width: 20,
				maxWidthPct,
				wrap: wrap as any,
				pad,
			}),
		);

		const contentLines = out.split("\n").filter((l) => l.includes("│"));
		expect(contentLines.length).toBeGreaterThan(3);
		expect(out).not.toContain("…");
		expect(out).toContain("word");
		expect(out).toContain("tail");
		expect(out).not.toContain("a".repeat(maxContent));
	});

	it("wrap=-0 takes nowrap truncate path (SameValueZero falsy)", () => {
		const logger = new Logger({ name: "wrap-nz" });
		const pad = 1;
		const maxWidthPct = 0.9;
		const maxContent = maxContentFor(50, pad, maxWidthPct);
		const over = "a".repeat(maxContent + 5);

		const out = stripAnsi(
			logger.formatBox({
				title: "T",
				description: "d",
				lines: [over],
				width: 20,
				maxWidthPct,
				wrap: -0 as any,
				pad,
			}),
		);

		expect(out).toContain(`${"a".repeat(maxContent - 1)}…`);
		expect(out).not.toContain("a".repeat(maxContent + 1));
	});
});
