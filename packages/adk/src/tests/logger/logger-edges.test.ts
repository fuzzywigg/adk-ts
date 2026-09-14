import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

describe("Logger edges", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_DEBUG: process.env.ADK_DEBUG,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
		ADK_WARN_FORMAT: process.env.ADK_WARN_FORMAT,
		ADK_AGENT_BUILDER_WARN: process.env.ADK_AGENT_BUILDER_WARN,
	};
	const originalColumns = process.stdout.columns;

	let Logger: typeof import("../../logger").Logger;
	let warnSpy: ReturnType<typeof vi.spyOn>;
	let logSpy: ReturnType<typeof vi.spyOn>;

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

		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

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

	describe("columns || 80", () => {
		it("uses stdout.columns fallback of 80 when columns is falsy", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			(process.stdout as { columns?: number }).columns = 0;
			const logger = new Logger({ name: "cols" });
			const out = stripAnsi(
				logger.formatBox({
					title: "Cols",
					description: "ok",
					width: 60,
					maxWidthPct: 1,
				}),
			);
			expect(out).toContain("┌");
			expect(out).toContain("Cols");
		});

		it("respects positive stdout.columns for box width", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			process.stdout.columns = 40;
			const logger = new Logger({ name: "cols" });
			const out = stripAnsi(
				logger.formatBox({
					title: "Title",
					description: "x".repeat(80),
					width: 10,
					maxWidthPct: 0.5,
					wrap: false,
				}),
			);
			expect(out).toContain("…");
		});
	});

	describe("severity || 'warn' and LOG_LEVELS unknown", () => {
		it("falls back to warn icon for unknown severity", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "structured" });
			logger.warnStructured(
				{
					code: "S1",
					message: "unknown-sev",
					severity: "not-a-level" as any,
				},
				{ format: "pretty" },
			);
			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("🚧");
			expect(rendered).toContain("S1");
		});

		it("defaults severity to warn when omitted in pretty format", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "structured" });
			logger.warnStructured({
				code: "P1",
				message: "pretty-warn",
				suggestion: "fix it",
			});
			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("🚧");
			expect(rendered).toContain("P1");
		});

		it("uses info and error icons for known severities", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "sev" });
			logger.warnStructured(
				{ code: "I1", message: "info-msg", severity: "info" },
				{ format: "pretty" },
			);
			logger.warnStructured(
				{ code: "E1", message: "error-msg", severity: "error" },
				{ format: "pretty" },
			);
			const infoOut = stripAnsi(String(warnSpy.mock.calls[0][0]));
			const errorOut = stripAnsi(String(warnSpy.mock.calls[1][0]));
			expect(infoOut).toContain("ℹ️");
			expect(errorOut).toContain("❌");
		});
	});

	describe("(empty) and (empty list) format", () => {
		it("renders (empty) for debugStructured with empty object", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "dbg" });
			logger.isDebugEnabled = true;
			logger.debugStructured("empty-title", {});
			const out = stripAnsi(String(logSpy.mock.calls[0][0]));
			expect(out).toContain("(empty)");
		});

		it("renders (empty list) for debugArray with empty array", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "dbg" });
			logger.isDebugEnabled = true;
			logger.debugArray("none", []);
			const out = stripAnsi(String(logSpy.mock.calls[0][0]));
			expect(out).toContain("(empty list)");
		});
	});

	describe("ADK_WARN_FORMAT unset vs empty string", () => {
		it("uses pretty format when ADK_WARN_FORMAT is unset", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			delete process.env.ADK_WARN_FORMAT;
			const logger = new Logger({ name: "fmt" });
			logger.warnStructured({
				code: "U1",
				message: "unset-env",
				suggestion: "hint",
			});
			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("U1");
			expect(rendered).toContain("• Suggestion: hint");
			expect(rendered).not.toContain("[U1]");
		});

		it("falls back to pretty when ADK_WARN_FORMAT is empty string (falsy)", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			process.env.ADK_WARN_FORMAT = "";
			const logger = new Logger({ name: "fmt" });
			logger.warnStructured({
				code: "E1",
				message: "empty-env",
				suggestion: "do this",
			});
			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("E1");
			expect(rendered).toContain("• Suggestion: do this");
			expect(rendered).not.toContain("-> do this");
		});

		it("uses text format when ADK_WARN_FORMAT is explicitly text", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			process.env.ADK_WARN_FORMAT = "text";
			const logger = new Logger({ name: "fmt" });
			logger.warnStructured({
				code: "T1",
				message: "text-env",
				suggestion: "do this",
			});
			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("[T1] text-env");
			expect(rendered).toContain("-> do this");
		});

		it("honors explicit opts.format over env", () => {
			process.env.ADK_WARN_FORMAT = "text";
			const logger = new Logger({ name: "fmt" });
			logger.warnStructured(
				{ code: "J1", message: "json" },
				{ format: "json" },
			);
			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain('"code":"J1"');
		});
	});
});
