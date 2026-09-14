import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Seventeenth leftover: warnStructured `opts.format ||` / severity `||` keep
 * truthy strings `"0"`/`"false"` (fifteenth only pinned falsy format→env
 * fallthrough). Unknown format misses `json`/`pretty` → text branch; unknown
 * severity misses LOG_LEVELS → warn icon fallback.
 */
describe("Logger warnStructured format/severity string-zero-false seventeenth leftover", () => {
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
		{ label: '"0"', format: "0" },
		{ label: '"false"', format: "false" },
	] as const)("opts.format=$label blocks ADK_WARN_FORMAT=json → text [CODE]", ({
		format,
	}) => {
		process.env.ADK_WARN_FORMAT = "json";
		const logger = new Logger({ name: "fmt-str-block" });
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
		{ label: '"0"', envFormat: "0" },
		{ label: '"false"', envFormat: "false" },
	] as const)("ADK_WARN_FORMAT=$label (no opts) → text path, not json/pretty", ({
		envFormat,
	}) => {
		process.env.ADK_WARN_FORMAT = envFormat;
		const logger = new Logger({ name: "env-fmt-str" });
		logger.warnStructured({ code: "ENV", message: "via-env" });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[ENV] via-env");
		expect(rendered).not.toContain('"code":"ENV"');
		expect(rendered).not.toContain("🚧 ENV");
	});

	it.each([
		{ label: '"0"', severity: "0" },
		{ label: '"false"', severity: "false" },
	] as const)("severity=$label misses LOG_LEVELS → warn icon fallback", ({
		severity,
	}) => {
		const logger = new Logger({ name: "sev-str" });
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
		expect(rendered).not.toContain("ℹ️");
		expect(rendered).not.toContain("❌");
	});
});
