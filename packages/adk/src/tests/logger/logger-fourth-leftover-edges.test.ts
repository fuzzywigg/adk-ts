import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

describe("Logger fourth leftover — columns / severity / format matrices", () => {
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
		vi.spyOn(console, "log").mockImplementation(() => {});
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

	describe("columns || 80 matrix", () => {
		const columnCases: Array<{
			label: string;
			columns: number | undefined;
		}> = [
			{ label: "0", columns: 0 },
			{ label: "undefined", columns: undefined },
			{ label: "NaN coerced falsy path via 0", columns: 0 },
			{ label: "40", columns: 40 },
			{ label: "80", columns: 80 },
			{ label: "200", columns: 200 },
		];

		for (const row of columnCases) {
			it(`formatBox with stdout.columns=${row.label}`, () => {
				process.env.NODE_ENV = "development";
				delete process.env.ADK_FORCE_BOXES;
				(process.stdout as { columns?: number }).columns = row.columns as any;
				const logger = new Logger({ name: "cols" });
				const out = stripAnsi(
					logger.formatBox({
						title: "T",
						description: "d".repeat(30),
						width: 20,
						maxWidthPct: 0.9,
						wrap: false,
					}),
				);
				expect(out).toContain("┌");
				expect(out).toContain("T");
			});
		}
	});

	describe("severity || 'warn' and LOG_LEVELS fallback", () => {
		const severities: Array<{
			severity: any;
			icon: string;
		}> = [
			{ severity: undefined, icon: "🚧" },
			{ severity: "warn", icon: "🚧" },
			{ severity: "info", icon: "ℹ️" },
			{ severity: "error", icon: "❌" },
			{ severity: "debug", icon: "🐛" },
			{ severity: "not-a-level", icon: "🚧" },
			{ severity: "", icon: "🚧" },
			{ severity: "CRITICAL", icon: "🚧" },
		];

		for (const row of severities) {
			it(`pretty severity=${JSON.stringify(row.severity)} → ${row.icon}`, () => {
				process.env.NODE_ENV = "production";
				delete process.env.ADK_FORCE_BOXES;
				const logger = new Logger({ name: "sev" });
				logger.warnStructured(
					{
						code: "C1",
						message: "msg",
						severity: row.severity,
					},
					{ format: "pretty" },
				);
				const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
				expect(rendered).toContain(row.icon);
				expect(rendered).toContain("C1");
			});
		}
	});

	describe("format matrix (opts × env)", () => {
		const formats: Array<"pretty" | "json" | "text" | undefined> = [
			undefined,
			"pretty",
			"json",
			"text",
		];
		const envFormats = [undefined, "", "pretty", "json", "text"];

		for (const optsFormat of formats) {
			for (const envFormat of envFormats) {
				it(`opts=${String(optsFormat)} env=${JSON.stringify(envFormat)}`, () => {
					process.env.NODE_ENV = "production";
					delete process.env.ADK_FORCE_BOXES;
					if (envFormat === undefined) {
						delete process.env.ADK_WARN_FORMAT;
					} else {
						process.env.ADK_WARN_FORMAT = envFormat;
					}
					const logger = new Logger({ name: "fmt" });
					logger.warnStructured(
						{
							code: "F1",
							message: "format-check",
							suggestion: "hint",
						},
						optsFormat ? { format: optsFormat } : {},
					);
					const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
					const effective =
						optsFormat ||
						(envFormat as "pretty" | "json" | "text" | undefined) ||
						"pretty";

					if (effective === "json") {
						expect(rendered).toContain('"code":"F1"');
						expect(rendered).toContain('"message":"format-check"');
					} else if (effective === "text") {
						expect(rendered).toContain("[F1] format-check");
						expect(rendered).toContain("-> hint");
					} else {
						expect(rendered).toContain("F1");
						expect(rendered).toContain("• Suggestion: hint");
						expect(rendered).not.toContain("[F1]");
					}
				});
			}
		}
	});

	it("verbose context appears only when verbose/env set", () => {
		process.env.NODE_ENV = "production";
		delete process.env.ADK_FORCE_BOXES;
		delete process.env.ADK_AGENT_BUILDER_WARN;
		const logger = new Logger({ name: "ctx" });
		logger.warnStructured(
			{
				code: "V0",
				message: "quiet",
				context: { a: 1 },
			},
			{ format: "pretty" },
		);
		expect(stripAnsi(String(warnSpy.mock.calls[0][0]))).not.toContain(
			"Context:",
		);

		logger.warnStructured(
			{
				code: "V1",
				message: "loud",
				context: { a: 1 },
			},
			{ format: "pretty", verbose: true },
		);
		expect(stripAnsi(String(warnSpy.mock.calls[1][0]))).toContain("a=1");
	});
});
