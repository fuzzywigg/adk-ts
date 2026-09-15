import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Twenty-first leftover residual deepen after tip #292 / 5156762:
 * eighteenth pinned format/verbose/suggestion/severity/timestamp true/
 * `"true"`/`[]`/`-0`. Residual: string `"Infinity"` / `Object(1)` /
 * `Object(false)` on the same `||` / truthy-if / LOG_LEVELS lookup surfaces.
 */
describe("Logger warnStructured string-infinity/object-one/object-false twenty-first residual deepen", () => {
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
		{ label: '"Infinity"', format: "Infinity" },
		{ label: "Object(1)", format: Object(1) },
		{ label: "Object(false)", format: Object(false) },
	] as const)("opts.format=$label blocks ADK_WARN_FORMAT=json → text", ({
		format,
	}) => {
		process.env.ADK_WARN_FORMAT = "json";
		const logger = new Logger({ name: "fmt-21" });
		logger.warnStructured(
			{ code: "BLK", message: "blocked" },
			{ format: format as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[BLK] blocked");
		expect(rendered).not.toContain('"code":"BLK"');
		expect(rendered).not.toContain("🚧 BLK");
	});

	it.each([
		{ label: '"Infinity"', verbose: "Infinity" },
		{ label: "Object(1)", verbose: Object(1) },
		{ label: "Object(false)", verbose: Object(false) },
	] as const)("opts.verbose=$label enables Context without exact env", ({
		verbose,
	}) => {
		const logger = new Logger({ name: "verb-21" });
		logger.warnStructured(
			{ code: "V", message: "m", context: { k: 1 } },
			{ format: "pretty", verbose: verbose as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Context:");
		expect(rendered).toContain("k=1");
	});

	it.each([
		{ label: '"Infinity"', suggestion: "Infinity" },
		{ label: "Object(1)", suggestion: Object(1) },
		{ label: "Object(false)", suggestion: Object(false) },
	] as const)("pretty keeps Suggestion when suggestion=$label", ({
		suggestion,
	}) => {
		const logger = new Logger({ name: "sug-21" });
		logger.warnStructured(
			{ code: "S", message: "m", suggestion: suggestion as any },
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Suggestion:");
	});

	it.each([
		{ label: '"Infinity"', severity: "Infinity" },
		{ label: "Object(1)", severity: Object(1) },
		{ label: "Object(false)", severity: Object(false) },
	] as const)("severity=$label misses LOG_LEVELS → warn icon fallback", ({
		severity,
	}) => {
		const logger = new Logger({ name: "sev-21" });
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
		{
			label: '"Infinity"',
			timestamp: "Infinity",
			needle: '"timestamp":"Infinity"',
		},
		{ label: "Object(1)", timestamp: Object(1), needle: '"timestamp":1' },
		{
			label: "Object(false)",
			timestamp: Object(false),
			needle: '"timestamp":false',
		},
	] as const)("json keeps truthy timestamp=$label via || then spread", ({
		timestamp,
		needle,
	}) => {
		const logger = new Logger({ name: "ts-21" });
		logger.warnStructured(
			{ code: "T", message: "m", timestamp: timestamp as any },
			{ format: "json" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain(needle);
	});
});
