import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Eighteenth leftover (HEAVY tip-relaunch residual after #227):
 * formatArgs/extractMeta `!arg` — seventeenth kept `"0"`/`"false"`; fifteenth
 * skipped NaN. Residual: boolean `true` / `"true"` / `[]` / `±Infinity` kept;
 * SameValueZero `-0` skipped like numeric `0`.
 */
describe("Logger formatArgs true/string-true/negzero/infinity eighteenth leftover", () => {
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
		{ label: "boolean true", value: true, needle: "• true" },
		{ label: '"true"', value: "true", needle: "• true" },
		{ label: "empty array", value: [], needle: "• []" },
		{
			label: "Infinity",
			value: Number.POSITIVE_INFINITY,
			needle: "• Infinity",
		},
		{
			label: "-Infinity",
			value: Number.NEGATIVE_INFINITY,
			needle: "• -Infinity",
		},
	] as const)("info keeps truthy residual arg $label via !arg", ({
		value,
		needle,
	}) => {
		const logger = new Logger({ name: "fmt-true-keep" });
		logger.info("m", value as any, { x: 1 });
		const rendered = stripAnsi(String(debugSpy.mock.calls[0][0]));
		expect(rendered).toContain(needle);
		expect(rendered).toContain('"x":1');
	});

	it("info skips SameValueZero -0 via !arg (twin of numeric 0)", () => {
		const logger = new Logger({ name: "fmt-negzero" });
		logger.info("m", -0, { x: 1 });
		const rendered = stripAnsi(String(debugSpy.mock.calls[0][0]));
		expect(rendered).toContain('"x":1');
		expect(rendered).not.toContain("• 0");
		expect(rendered).not.toContain("• -0");
	});

	it.each([
		{ label: "boolean true", suggestion: true },
		{ label: '"true"', suggestion: "true" },
		{ label: "empty array", suggestion: [] },
	] as const)("extractMeta keeps suggestion=$label (truthy residual)", ({
		suggestion,
	}) => {
		const logger = new Logger({ name: "meta-true-sug" });
		logger.warn("hinted", { suggestion: suggestion as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Suggestion:");
	});

	it("extractMeta skips suggestion=-0 via if (meta.suggestion)", () => {
		const logger = new Logger({ name: "meta-negzero-sug" });
		logger.warn("hinted", { suggestion: -0 as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).not.toContain("• Suggestion:");
	});
});
