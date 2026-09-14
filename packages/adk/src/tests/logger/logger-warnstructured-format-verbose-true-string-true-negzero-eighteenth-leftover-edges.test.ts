import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Eighteenth leftover (HEAVY tip-relaunch residual after #227):
 * warnStructured `opts.format ||` / `opts.verbose ||` / suggestion /
 * severity / timestamp — seventeenth pinned `"0"`/`"false"` format+severity;
 * fifteenth pinned `"0"`/`"false"` verbose+suggestion. Residual: boolean
 * `true` / `"true"` / `[]` keep; SameValueZero `-0` falls through.
 */
describe("Logger warnStructured format/verbose true/string-true/negzero eighteenth leftover", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
		ADK_WARN_FORMAT: process.env.ADK_WARN_FORMAT,
		ADK_AGENT_BUILDER_WARN: process.env.ADK_AGENT_BUILDER_WARN,
	};

	let Logger: typeof import("../../logger").Logger;
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
		delete process.env.ADK_WARN_FORMAT;
		delete process.env.ADK_AGENT_BUILDER_WARN;
		vi.spyOn(console, "log").mockImplementation(() => {});
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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
		{ label: "boolean true", format: true },
		{ label: '"true"', format: "true" },
		{ label: "empty array", format: [] },
	] as const)("opts.format=$label blocks ADK_WARN_FORMAT=json → text", ({
		format,
	}) => {
		process.env.ADK_WARN_FORMAT = "json";
		const logger = new Logger({ name: "fmt-true-block" });
		logger.warnStructured(
			{ code: "BLK", message: "blocked" },
			{ format: format as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[BLK] blocked");
		expect(rendered).not.toContain('"code":"BLK"');
		expect(rendered).not.toContain("🚧 BLK");
	});

	it("opts.format=-0 falls through to ADK_WARN_FORMAT=json", () => {
		process.env.ADK_WARN_FORMAT = "json";
		const logger = new Logger({ name: "fmt-negzero" });
		logger.warnStructured(
			{ code: "NZ", message: "via-env" },
			{ format: -0 as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain('"code":"NZ"');
		expect(rendered).toContain('"message":"via-env"');
	});

	it.each([
		{ label: "boolean true", verbose: true },
		{ label: '"true"', verbose: "true" },
		{ label: "empty array", verbose: [] },
	] as const)("opts.verbose=$label enables Context without exact env", ({
		verbose,
	}) => {
		const logger = new Logger({ name: "verb-true" });
		logger.warnStructured(
			{ code: "V", message: "m", context: { k: 1 } },
			{ format: "pretty", verbose: verbose as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Context:");
		expect(rendered).toContain("k=1");
	});

	it("opts.verbose=-0 does not enable Context (falsy fallthrough)", () => {
		const logger = new Logger({ name: "verb-negzero" });
		logger.warnStructured(
			{ code: "V", message: "m", context: { k: 1 } },
			{ format: "pretty", verbose: -0 as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).not.toContain("Context:");
	});

	it.each([
		{ label: "boolean true", suggestion: true },
		{ label: '"true"', suggestion: "true" },
		{ label: "empty array", suggestion: [] },
	] as const)("pretty keeps Suggestion when suggestion=$label", ({
		suggestion,
	}) => {
		const logger = new Logger({ name: "sug-true" });
		logger.warnStructured(
			{ code: "S", message: "m", suggestion: suggestion as any },
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Suggestion:");
	});

	it("suggestion=-0 omits Suggestion (falsy)", () => {
		const logger = new Logger({ name: "sug-negzero" });
		logger.warnStructured(
			{ code: "S", message: "m", suggestion: -0 as any },
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).not.toContain("Suggestion:");
	});

	it.each([
		{ label: "boolean true", severity: true },
		{ label: '"true"', severity: "true" },
	] as const)("severity=$label misses LOG_LEVELS → warn icon fallback", ({
		severity,
	}) => {
		const logger = new Logger({ name: "sev-true" });
		logger.warnStructured(
			{
				code: "SEV",
				message: "unknown-sev",
				severity: severity as any,
			},
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("🚧 SEV unknown-sev");
		expect(rendered).not.toContain("🐛");
		expect(rendered).not.toContain("❌");
	});

	it.each([
		{ label: "boolean true", timestamp: true, needle: '"timestamp":true' },
		{ label: '"true"', timestamp: "true", needle: '"timestamp":"true"' },
	] as const)("json keeps truthy timestamp=$label via || then spread", ({
		timestamp,
		needle,
	}) => {
		const logger = new Logger({ name: "ts-true" });
		logger.warnStructured(
			{ code: "T", message: "m", timestamp: timestamp as any },
			{ format: "json" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain(needle);
	});

	it("json timestamp=-0: || picks ISO but ...warning overwrites with 0", () => {
		const logger = new Logger({ name: "ts-negzero" });
		logger.warnStructured(
			{ code: "T", message: "m", timestamp: -0 as any },
			{ format: "json" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain('"timestamp":0');
		expect(rendered).not.toMatch(/"timestamp":"\d{4}-/);
	});
});
