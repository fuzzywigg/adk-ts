import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Eighteenth leftover (logger/env residual HEAVY): warnStructured `||`
 * SameValueZero `-0` collapse vs truthy near-miss keep for `[]` /
 * `NEGATIVE_INFINITY` / string `"true"` on format / severity / timestamp
 * after boolean-true port and seventeenth string `"0"`/`"false"`.
 */
describe("Logger warnStructured negzero/emptyarray/infinity/string-true eighteenth leftover", () => {
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

	it("opts.format=-0 falls through to ADK_WARN_FORMAT=json (SameValueZero falsy)", () => {
		process.env.ADK_WARN_FORMAT = "json";
		const logger = new Logger({ name: "fmt-negzero" });
		logger.warnStructured(
			{ code: "NZ", message: "fallthrough" },
			{ format: -0 as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain('"code":"NZ"');
		expect(rendered).not.toContain("[NZ] fallthrough");
	});

	it.each([
		{ label: "empty array", value: [] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
		{ label: 'string "true"', value: "true" },
	])("opts.format=$label blocks json env → text (truthy miss)", ({ value }) => {
		process.env.ADK_WARN_FORMAT = "json";
		const logger = new Logger({ name: "fmt-near-miss" });
		logger.warnStructured(
			{ code: "NM", message: "blocked" },
			{ format: value as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[NM] blocked");
		expect(rendered).not.toContain('"code":"NM"');
		expect(rendered).not.toContain("🚧 NM");
	});

	it("severity=-0 collapses via || to warn icon", () => {
		const logger = new Logger({ name: "sev-negzero" });
		logger.warnStructured(
			{
				code: "SNZ",
				message: "neg",
				severity: -0 as any,
			},
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("🚧 SNZ neg");
	});

	it.each([
		{ label: "empty array", value: [] },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
		{ label: 'string "true"', value: "true" },
	])("severity=$label misses LOG_LEVELS → warn icon fallback", ({ value }) => {
		const logger = new Logger({ name: "sev-near-miss" });
		logger.warnStructured(
			{
				code: "SM",
				message: "miss",
				severity: value as any,
			},
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("🚧 SM miss");
		expect(rendered).not.toContain("🐛");
		expect(rendered).not.toContain("ℹ️");
		expect(rendered).not.toContain("❌");
	});

	it("json timestamp=-0: || coalesces then ...warning spread restores 0", () => {
		const logger = new Logger({ name: "ts-negzero" });
		logger.warnStructured(
			{
				code: "TNZ",
				message: "spread-restore",
				timestamp: -0 as any,
			},
			{ format: "json" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		const payload = JSON.parse(rendered.slice(rendered.indexOf("{")));
		expect(payload.timestamp).toBe(0);
		expect(typeof payload.timestamp).toBe("number");
		expect(Object.is(payload.timestamp, -0)).toBe(false);
	});

	it.each([
		{ label: "empty array", value: [], jsonValue: [] },
		{
			label: "NEGATIVE_INFINITY",
			value: Number.NEGATIVE_INFINITY,
			jsonValue: null,
		},
		{ label: 'string "true"', value: "true", jsonValue: "true" },
	])("json timestamp=$label kept via ||+spread (JSON wire=$jsonValue)", ({
		value,
		jsonValue,
	}) => {
		const logger = new Logger({ name: "ts-near-miss" });
		logger.warnStructured(
			{
				code: "TK",
				message: "keep",
				timestamp: value as any,
			},
			{ format: "json" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		const payload = JSON.parse(rendered.slice(rendered.indexOf("{")));
		expect(payload.timestamp).toEqual(jsonValue);
	});
});
