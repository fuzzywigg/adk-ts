import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

describe("Logger objectToLines/wrap sixth leftover edges (post #151)", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_DEBUG: process.env.ADK_DEBUG,
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
		process.stdout.columns = 120;
		process.env.NODE_ENV = "development";
		process.env.ADK_DEBUG = "true";
		delete process.env.ADK_FORCE_BOXES;
		vi.spyOn(console, "log").mockImplementation(() => {});
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

	it("objectToLines silently truncates after 200 keys via debugStructured", () => {
		const logger = new Logger({ name: "obj200" });
		const data: Record<string, number> = {};
		for (let i = 0; i < 205; i++) {
			data[`k${String(i).padStart(3, "0")}`] = i;
		}

		const lines = (logger as any).objectToLines(data);
		expect(lines).toHaveLength(200);
		expect(lines[0]).toContain("k000");
		expect(lines[199]).toContain("k199");
		expect(lines.some((l: string) => l.includes("k200"))).toBe(false);
	});

	it.each([
		{ label: "null", data: null },
		{ label: "undefined", data: undefined },
		{ label: "0", data: 0 },
		{ label: "false", data: false },
		{ label: "empty string", data: "" },
	] as const)("objectToLines coalesces $label via Object.entries(obj || {}) to (empty)", ({
		data,
	}) => {
		const logger = new Logger({ name: "obj-nullish" });
		expect((logger as any).objectToLines(data)).toEqual(["(empty)"]);
	});

	it("formatBox wrap hard-cuts when lastSpace is before 60% of maxContent", () => {
		process.stdout.columns = 50;
		const logger = new Logger({ name: "wrap-early" });
		const pad = 1;
		const maxWidthPct = 0.9;
		const maxWidth = Math.floor(50 * maxWidthPct);
		const actualMaxContent = maxWidth - 2 - pad * 2;
		const threshold = Math.floor(actualMaxContent * 0.6);
		const earlySpaceAt = Math.max(1, threshold - 3);
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
		const firstPlain = bodyLines[0].replace(/[│]/g, "").trimEnd();
		expect(firstPlain.length).toBeGreaterThan(earlySpaceAt);
		expect(firstPlain).toContain("b");
	});

	it("formatBox wrap breaks on space when lastSpace is past 60% threshold", () => {
		process.stdout.columns = 50;
		const logger = new Logger({ name: "wrap-late" });
		const pad = 1;
		const maxWidthPct = 0.9;
		const maxWidth = Math.floor(50 * maxWidthPct);
		const actualMaxContent = maxWidth - 2 - pad * 2;
		const lateSpaceAt = Math.floor(actualMaxContent * 0.6) + 2;
		const longLine = `${"a".repeat(lateSpaceAt)} ${"b".repeat(actualMaxContent + 5)}`;

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
		expect(firstPlain).toBe("a".repeat(lateSpaceAt));
		expect(bodyLines.some((l) => l.includes("b"))).toBe(true);
	});
});
