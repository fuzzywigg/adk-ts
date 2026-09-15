import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Nineteenth leftover residual deepen after tip #289 / f93c037:
 * tip pinned env ADK_WARN_FORMAT `"true"`/`"Infinity"`, AGENT_BUILDER
 * `"true"` miss, severity=`"true"`. Residual: env `"-Infinity"`/`"NaN"`/`"1"`
 * → text; AGENT_BUILDER `"1"`/`"Infinity"` miss verbose; severity
 * +Infinity/NaN/{}/Object(true)/1 → warn icon fallback.
 */
describe("Logger ADK_WARN_FORMAT/severity posinf/nan/object-true nineteenth residual deepen", () => {
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
		{ label: '"-Infinity"', value: "-Infinity" },
		{ label: '"NaN"', value: "NaN" },
		{ label: '"1"', value: "1" },
	] as const)("ADK_WARN_FORMAT=$label misses json/pretty → text path", ({
		value,
	}) => {
		process.env.ADK_WARN_FORMAT = value;
		const logger = new Logger({ name: "env-fmt-res" });
		logger.warnStructured({ code: "RES", message: "via-env" });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[RES] via-env");
		expect(rendered).not.toContain('"code":"RES"');
		expect(rendered).not.toContain("🚧 RES");
	});

	it.each([
		{ label: '"1"', value: "1" },
		{ label: '"Infinity"', value: "Infinity" },
	] as const)('ADK_AGENT_BUILDER_WARN=$label does not enable Context (not === "verbose")', ({
		value,
	}) => {
		process.env.ADK_AGENT_BUILDER_WARN = value;
		const logger = new Logger({ name: "abw-res" });
		logger.warnStructured(
			{ code: "V", message: "m", context: { k: 1 } },
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("🚧 V m");
		expect(rendered).not.toContain("Context:");
	});

	it.each([
		{ label: "Infinity", severity: Number.POSITIVE_INFINITY },
		{ label: "NaN", severity: Number.NaN },
		{ label: "empty object", severity: {} },
		{ label: "Object(true)", severity: Object(true) },
		{ label: "number 1", severity: 1 },
	] as const)("severity=$label falls through LOG_LEVELS → warn icon", ({
		severity,
	}) => {
		const logger = new Logger({ name: "sev-res" });
		logger.warnStructured(
			{ code: "S", message: "m", severity: severity as any },
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("🚧 S m");
		expect(rendered).not.toContain("🐛");
		expect(rendered).not.toContain("❌");
	});
});
