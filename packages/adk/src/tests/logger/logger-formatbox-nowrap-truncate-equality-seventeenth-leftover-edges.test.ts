import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Seventeenth leftover: formatBox `!wrap` uses `text.length > maxContent`
 * (keep exact equality; truncate at equality+1 via slice(0, maxContent-1)+…).
 * Sixteenth covered wrap soft-cut equality only.
 */
describe("Logger formatBox nowrap truncate equality seventeenth leftover", () => {
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

	it("nowrap keeps text when length === maxContent (no ellipsis)", () => {
		const logger = new Logger({ name: "nowrap-eq" });
		const pad = 1;
		const maxWidthPct = 0.9;
		const maxContent = maxContentFor(50, pad, maxWidthPct);
		const exact = "a".repeat(maxContent);

		const out = stripAnsi(
			logger.formatBox({
				title: "T",
				description: "d",
				lines: [exact],
				width: 20,
				maxWidthPct,
				wrap: false,
				pad,
			}),
		);

		const body = out
			.split("\n")
			.find((line) => line.includes("│") && line.includes("a"));
		expect(body).toBeDefined();
		expect(body).toContain(exact);
		expect(body).not.toContain("…");
	});

	it("nowrap truncates length === maxContent+1 to slice(0,maxContent-1)+…", () => {
		const logger = new Logger({ name: "nowrap-plus" });
		const pad = 1;
		const maxWidthPct = 0.9;
		const maxContent = maxContentFor(50, pad, maxWidthPct);
		const over = "b".repeat(maxContent + 1);

		const out = stripAnsi(
			logger.formatBox({
				title: "T",
				description: "d",
				lines: [over],
				width: 20,
				maxWidthPct,
				wrap: false,
				pad,
			}),
		);

		const body = out
			.split("\n")
			.find((line) => line.includes("│") && line.includes("b"));
		expect(body).toBeDefined();
		const expected = `${"b".repeat(maxContent - 1)}…`;
		expect(body).toContain(expected);
		expect(body).not.toContain(over);
	});

	it("nowrap still truncates much-longer text at same boundary", () => {
		const logger = new Logger({ name: "nowrap-long" });
		const pad = 1;
		const maxWidthPct = 0.9;
		const maxContent = maxContentFor(50, pad, maxWidthPct);
		const long = "c".repeat(maxContent + 40);

		const out = stripAnsi(
			logger.formatBox({
				title: "T",
				description: "d",
				lines: [long],
				width: 20,
				maxWidthPct,
				wrap: false,
				pad,
			}),
		);

		const body = out
			.split("\n")
			.find((line) => line.includes("│") && line.includes("c"));
		expect(body).toBeDefined();
		expect(body).toContain(`${"c".repeat(maxContent - 1)}…`);
		expect(body).not.toContain(long);
	});
});
