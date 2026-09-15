import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Twenty-first leftover residual deepen after tip #292 / 5156762:
 * nineteenth pinned wrap true/`"true"`/`[]`/`1` vs `-0`. Residual:
 * string `"Infinity"` / `Object(1)` / `Object(false)` all truthy → wrap path
 * (`!wrap` miss) despite boxed false / numeric string looks.
 */
describe("Logger formatBox wrap string-infinity/object-one/object-false twenty-first residual deepen", () => {
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
		{ label: '"Infinity"', wrap: "Infinity" },
		{ label: "Object(1)", wrap: Object(1) },
		{ label: "Object(false)", wrap: Object(false) },
	] as const)("wrap=$label takes wrap path (multi-line, no ellipsis)", ({
		wrap,
	}) => {
		const logger = new Logger({ name: "wrap-21" });
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
});
