import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after #253):
 * warnStructured `opts.format ||` / `opts.verbose ||` / suggestion /
 * severity / timestamp — eighteenth pinned true/`"true"`/`[]`/`-0`.
 * Residual: empty `{}` / peers `1` / ±Infinity keep; NaN falls through.
 */
describe("Logger warnStructured format/verbose nan/infinity/empty-object nineteenth leftover", () => {
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
		{ label: "empty object", format: {} },
		{ label: "peers 1", format: 1 },
		{ label: "Infinity", format: Number.POSITIVE_INFINITY },
		{ label: "-Infinity", format: Number.NEGATIVE_INFINITY },
	] as const)("opts.format=$label blocks ADK_WARN_FORMAT=json → text", ({
		format,
	}) => {
		process.env.ADK_WARN_FORMAT = "json";
		const logger = new Logger({ name: "fmt-19h-block" });
		logger.warnStructured(
			{ code: "BLK", message: "blocked" },
			{ format: format as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[BLK] blocked");
		expect(rendered).not.toContain('"code":"BLK"');
		expect(rendered).not.toContain("🚧 BLK");
	});

	it("opts.format=NaN falls through to ADK_WARN_FORMAT=json", () => {
		process.env.ADK_WARN_FORMAT = "json";
		const logger = new Logger({ name: "fmt-19h-nan" });
		logger.warnStructured(
			{ code: "NZ", message: "via-env" },
			{ format: Number.NaN as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain('"code":"NZ"');
		expect(rendered).toContain('"message":"via-env"');
	});

	it.each([
		{ label: "empty object", verbose: {} },
		{ label: "peers 1", verbose: 1 },
		{ label: "Infinity", verbose: Number.POSITIVE_INFINITY },
	] as const)("opts.verbose=$label enables Context without exact env", ({
		verbose,
	}) => {
		const logger = new Logger({ name: "verb-19h" });
		logger.warnStructured(
			{ code: "V", message: "m", context: { k: 1 } },
			{ format: "pretty", verbose: verbose as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Context:");
		expect(rendered).toContain("k=1");
	});

	it("opts.verbose=NaN does not enable Context (falsy fallthrough)", () => {
		const logger = new Logger({ name: "verb-19h-nan" });
		logger.warnStructured(
			{ code: "V", message: "m", context: { k: 1 } },
			{ format: "pretty", verbose: Number.NaN as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).not.toContain("Context:");
	});

	it.each([
		{ label: "empty object", suggestion: {} },
		{ label: "peers 1", suggestion: 1 },
		{ label: "Infinity", suggestion: Number.POSITIVE_INFINITY },
	] as const)("pretty keeps Suggestion when suggestion=$label", ({
		suggestion,
	}) => {
		const logger = new Logger({ name: "sug-19h" });
		logger.warnStructured(
			{ code: "S", message: "m", suggestion: suggestion as any },
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Suggestion:");
	});

	it("suggestion=NaN omits Suggestion (falsy)", () => {
		const logger = new Logger({ name: "sug-19h-nan" });
		logger.warnStructured(
			{ code: "S", message: "m", suggestion: Number.NaN as any },
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).not.toContain("Suggestion:");
	});

	it.each([
		{ label: "empty object", severity: {} },
		{ label: "peers 1", severity: 1 },
		{ label: "Infinity", severity: Number.POSITIVE_INFINITY },
		{ label: "NaN", severity: Number.NaN },
	] as const)("severity=$label misses LOG_LEVELS → warn icon fallback", ({
		severity,
	}) => {
		const logger = new Logger({ name: "sev-19h" });
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
		{ label: "empty object", timestamp: {}, needle: '"timestamp":{}' },
		{ label: "peers 1", timestamp: 1, needle: '"timestamp":1' },
	] as const)("json keeps truthy timestamp=$label via || then spread", ({
		timestamp,
		needle,
	}) => {
		const logger = new Logger({ name: "ts-19h" });
		logger.warnStructured(
			{ code: "T", message: "m", timestamp: timestamp as any },
			{ format: "json" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain(needle);
	});

	it.each([
		{ label: "NaN", timestamp: Number.NaN },
		{ label: "Infinity", timestamp: Number.POSITIVE_INFINITY },
	] as const)("json timestamp=$label → JSON null (not ISO string)", ({
		timestamp,
	}) => {
		const logger = new Logger({ name: "ts-19h-null" });
		logger.warnStructured(
			{ code: "T", message: "m", timestamp: timestamp as any },
			{ format: "json" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain('"timestamp":null');
		expect(rendered).not.toMatch(/"timestamp":"\d{4}-/);
	});
});
