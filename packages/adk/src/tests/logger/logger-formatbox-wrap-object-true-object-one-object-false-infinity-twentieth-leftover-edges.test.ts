import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Twentieth leftover residual deepen after tip #289 / #292:
 * nineteenth pinned wrap `"true"`/`[]`/`1`/`-0`. Residual: boxed
 * `Object(true)` / `Object(1)` / `Object(false)` / `"Infinity"` all take
 * wrap path — `Object(false)` is truthy so `!wrap` misses (unlike `-0`).
 */
describe("Logger formatBox wrap object-true/one/false/infinity twentieth leftover", () => {
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
		{ label: "Object(true)", wrap: Object(true) },
		{ label: "Object(1)", wrap: Object(1) },
		{ label: "Object(false)", wrap: Object(false) },
		{ label: 'string "Infinity"', wrap: "Infinity" },
	])("wrap=$label takes wrap path (multi-line, no ellipsis)", ({ wrap }) => {
		const logger = new Logger({ name: "wrap-boxed" });
		const long = `${"word ".repeat(20)}tail`;

		const out = stripAnsi(
			logger.formatBox({
				title: "Title",
				description: "Desc",
				lines: [long],
				width: 20,
				maxWidthPct: 0.9,
				wrap: wrap as any,
				pad: 1,
			}),
		);

		const contentLines = out.split("\n").filter((l) => l.includes("│"));
		expect(contentLines.length).toBeGreaterThan(3);
		expect(out).not.toContain("…");
		expect(out).toContain("word");
		expect(out).toContain("tail");
	});

	it("wrap=false control still takes nowrap truncate (primitive twin)", () => {
		const logger = new Logger({ name: "wrap-prim" });
		const maxWidth = Math.floor(50 * 0.9);
		const maxContent = maxWidth - 2 - 2;
		const over = "a".repeat(maxContent + 5);

		const out = stripAnsi(
			logger.formatBox({
				title: "T",
				description: "d",
				lines: [over],
				width: 20,
				maxWidthPct: 0.9,
				wrap: false,
				pad: 1,
			}),
		);

		expect(out).toContain(`${"a".repeat(maxContent - 1)}…`);
	});
});
