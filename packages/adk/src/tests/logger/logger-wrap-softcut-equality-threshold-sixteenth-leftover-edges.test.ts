import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Sixteenth leftover: formatBox wrap soft-cut uses `lastSpace >= floor(0.6 *
 * maxContent)`. Sixth leftover hit threshold-3 (hard) and threshold+2 (soft);
 * fifteenth hit lastSpace === -1. Exact equality and equality-minus-one remain.
 */
describe("Logger wrap soft-cut equality threshold sixteenth leftover", () => {
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

	function maxContentFor(
		columns: number,
		pad: number,
		maxWidthPct: number,
	): number {
		const maxWidth = Math.floor(columns * maxWidthPct);
		return maxWidth - 2 - pad * 2;
	}

	it("soft-breaks when lastSpace === floor(0.6 * maxContent) (exact >=)", () => {
		const logger = new Logger({ name: "wrap-eq" });
		const pad = 1;
		const maxWidthPct = 0.9;
		const actualMaxContent = maxContentFor(50, pad, maxWidthPct);
		const threshold = Math.floor(actualMaxContent * 0.6);
		const longLine = `${"a".repeat(threshold)} ${"b".repeat(actualMaxContent + 5)}`;

		const out = stripAnsi(
			logger.formatBox({
				title: "T",
				description: "d",
				lines: [longLine],
				width: 20,
				maxWidthPct,
				wrap: true,
				pad,
			}),
		);

		const bodyLines = out
			.split("\n")
			.filter((line) => line.includes("│") && /a|b/.test(line));
		expect(bodyLines.length).toBeGreaterThan(1);
		const firstPlain = bodyLines[0].replace(/[│ ]/g, "");
		expect(firstPlain).toBe("a".repeat(threshold));
		expect(bodyLines.some((l) => /b/.test(l))).toBe(true);
	});

	it("hard-cuts when lastSpace === floor(0.6 * maxContent) - 1 (>= fails by one)", () => {
		const logger = new Logger({ name: "wrap-eq-minus" });
		const pad = 1;
		const maxWidthPct = 0.9;
		const actualMaxContent = maxContentFor(50, pad, maxWidthPct);
		const threshold = Math.floor(actualMaxContent * 0.6);
		const earlySpaceAt = threshold - 1;
		expect(earlySpaceAt).toBeGreaterThan(0);
		const longLine = `${"a".repeat(earlySpaceAt)} ${"b".repeat(actualMaxContent + 5)}`;

		const out = stripAnsi(
			logger.formatBox({
				title: "T",
				description: "d",
				lines: [longLine],
				width: 20,
				maxWidthPct,
				wrap: true,
				pad,
			}),
		);

		const bodyLines = out
			.split("\n")
			.filter((line) => line.includes("│") && /a|b/.test(line));
		expect(bodyLines.length).toBeGreaterThan(1);
		const firstPlain = bodyLines[0].replace(/[│ ]/g, "").trimEnd();
		// Hard-cut ignores early space: first chunk absorbs past earlySpaceAt into b's
		// (contrast soft-break which would yield only "a".repeat(earlySpaceAt)).
		expect(firstPlain.length).toBeGreaterThan(earlySpaceAt);
		expect(firstPlain).toContain("b");
		expect(firstPlain).not.toBe("a".repeat(earlySpaceAt));
		expect(firstPlain.startsWith("a".repeat(earlySpaceAt))).toBe(true);
	});
});
