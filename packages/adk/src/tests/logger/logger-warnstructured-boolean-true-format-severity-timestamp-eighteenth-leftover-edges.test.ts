import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Eighteenth leftover (logger/env residual): warnStructured boolean `true` asymmetries after
 * seventeenth string `"0"`/`"false"` wave — `opts.format ||` / severity `||`
 * / timestamp `||` keep boolean true (truthy miss of json/pretty / LOG_LEVELS
 * / ISO fallthrough). Also timestamp string `"false"` keep (seventh had `"0"`).
 */
describe("Logger warnStructured boolean-true format/severity/timestamp eighteenth leftover", () => {
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

	it("opts.format=true blocks ADK_WARN_FORMAT=json → text (boolean miss)", () => {
		process.env.ADK_WARN_FORMAT = "json";
		const logger = new Logger({ name: "fmt-bool-true" });
		logger.warnStructured(
			{ code: "BT", message: "blocked" },
			{ format: true as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[BT] blocked");
		expect(rendered).not.toContain('"code":"BT"');
		expect(rendered).not.toContain("🚧 BT");
	});

	it("severity=true misses LOG_LEVELS → warn icon fallback", () => {
		const logger = new Logger({ name: "sev-bool-true" });
		logger.warnStructured(
			{
				code: "SEV",
				message: "bool-sev",
				severity: true as any,
			},
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("🚧 SEV bool-sev");
		expect(rendered).not.toContain("🐛");
		expect(rendered).not.toContain("ℹ️");
		expect(rendered).not.toContain("❌");
	});

	it("json timestamp=true kept via || and spread (boolean truthy)", () => {
		const logger = new Logger({ name: "ts-bool-true" });
		logger.warnStructured(
			{
				code: "TS",
				message: "keep-bool",
				timestamp: true as any,
			},
			{ format: "json" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		const payload = JSON.parse(rendered.slice(rendered.indexOf("{")));
		expect(payload.timestamp).toBe(true);
	});

	it('json timestamp="false" kept (truthy string; seventh covered "0")', () => {
		const logger = new Logger({ name: "ts-str-false" });
		logger.warnStructured(
			{
				code: "TSF",
				message: "keep-str",
				timestamp: "false",
			},
			{ format: "json" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		const payload = JSON.parse(rendered.slice(rendered.indexOf("{")));
		expect(payload.timestamp).toBe("false");
	});
});
