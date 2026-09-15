import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Nineteenth leftover residual deepen after tip #289 / f93c037:
 * tip pinned formatBox wrap `"true"`/`[]`/`1` (wrap) vs `-0` (nowrap).
 * Residual: +Infinity/{}/Object(true) wrap path; NaN nowrap twin of `-0`.
 */
describe("Logger formatBox wrap posinf/nan/object-true nineteenth residual deepen", () => {
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
		{ label: "Infinity", wrap: Number.POSITIVE_INFINITY },
		{ label: "empty object", wrap: {} },
		{ label: "Object(true)", wrap: Object(true) },
	] as const)("wrap=$label takes wrap path (multi-line, no ellipsis)", ({
		wrap,
	}) => {
		const logger = new Logger({ name: "wrap-posinf" });
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

	it("wrap=NaN takes nowrap truncate path (falsy twin of tip -0)", () => {
		const logger = new Logger({ name: "wrap-nan" });
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
				wrap: Number.NaN as any,
				pad,
			}),
		);

		expect(out).toContain(`${"a".repeat(maxContent - 1)}…`);
		expect(out).not.toContain("a".repeat(maxContent + 1));
	});
});
