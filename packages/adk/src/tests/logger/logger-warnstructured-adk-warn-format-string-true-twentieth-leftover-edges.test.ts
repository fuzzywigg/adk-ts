import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Twentieth leftover residual after tip #279 / 1f70668 (#282):
 * seventeenth pinned ADK_WARN_FORMAT `"0"`/`"false"` → text; eighteenth
 * pinned opts.format true/`"true"`/`[]`. Residual: env ADK_WARN_FORMAT=
 * `"true"`/`"Infinity"` (no opts) → text; ADK_AGENT_BUILDER_WARN=`"true"`
 * does not enable verbose (strict === `"verbose"`); severity=`"true"`
 * falls through LOG_LEVELS → warn icon.
 */
describe("Logger ADK_WARN_FORMAT/AGENT_BUILDER string-true twentieth leftover", () => {
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

	it('ADK_WARN_FORMAT="true" (no opts) → text path, not json/pretty', () => {
		process.env.ADK_WARN_FORMAT = "true";
		const logger = new Logger({ name: "env-fmt-true" });
		logger.warnStructured({ code: "ENV", message: "via-env" });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[ENV] via-env");
		expect(rendered).not.toContain('"code":"ENV"');
		expect(rendered).not.toContain("🚧 ENV");
	});

	it('ADK_WARN_FORMAT="Infinity" misses json/pretty → text path', () => {
		process.env.ADK_WARN_FORMAT = "Infinity";
		const logger = new Logger({ name: "env-fmt-inf" });
		logger.warnStructured({ code: "INF", message: "via-inf" });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[INF] via-inf");
		expect(rendered).not.toContain('"code":"INF"');
	});

	it('ADK_AGENT_BUILDER_WARN="true" does not enable Context (not === "verbose")', () => {
		process.env.ADK_AGENT_BUILDER_WARN = "true";
		const logger = new Logger({ name: "abw-true" });
		logger.warnStructured(
			{ code: "V", message: "m", context: { k: 1 } },
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("🚧 V m");
		expect(rendered).not.toContain("Context:");
	});

	it('ADK_AGENT_BUILDER_WARN="verbose" control still enables Context', () => {
		process.env.ADK_AGENT_BUILDER_WARN = "verbose";
		const logger = new Logger({ name: "abw-verbose" });
		logger.warnStructured(
			{ code: "V", message: "m", context: { k: 1 } },
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Context:");
		expect(rendered).toContain("k=1");
	});

	it('severity="true" falls through LOG_LEVELS lookup → warn icon', () => {
		const logger = new Logger({ name: "sev-true" });
		logger.warnStructured(
			{ code: "S", message: "m", severity: "true" as any },
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("🚧 S m");
		expect(rendered).not.toContain("🐛");
		expect(rendered).not.toContain("❌");
	});
});
