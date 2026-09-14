import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Eighteenth leftover residual deepen (complements open #253):
 * #253 pinned warnStructured pretty format/verbose/suggestion/severity/timestamp
 * for true/"true"/[]/-0. Residual: text-format suggestion/verbose path;
 * severity=[]/-0; timestamp=[]; format=±Infinity.
 */
describe("Logger warnStructured text/severity-array/negzero eighteenth leftover", () => {
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
		{ label: "boolean true", suggestion: true },
		{ label: '"true"', suggestion: "true" },
		{ label: "empty array", suggestion: [] },
	] as const)("text format keeps Suggestion when suggestion=$label", ({
		suggestion,
	}) => {
		const logger = new Logger({ name: "txt-sug-true" });
		logger.warnStructured(
			{ code: "S", message: "m", suggestion: suggestion as any },
			{ format: "text" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[S] m");
		expect(rendered).toContain("->");
	});

	it("text format suggestion=-0 omits Suggestion (falsy)", () => {
		const logger = new Logger({ name: "txt-sug-nz" });
		logger.warnStructured(
			{ code: "S", message: "m", suggestion: -0 as any },
			{ format: "text" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[S] m");
		expect(rendered).not.toContain("->");
	});

	it.each([
		{ label: "boolean true", verbose: true },
		{ label: '"true"', verbose: "true" },
		{ label: "empty array", verbose: [] },
	] as const)("text format verbose=$label enables Context", ({ verbose }) => {
		const logger = new Logger({ name: "txt-verb" });
		logger.warnStructured(
			{ code: "V", message: "m", context: { k: 1 } },
			{ format: "text", verbose: verbose as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Context:");
		expect(rendered).toContain("k=1");
	});

	it("text format verbose=-0 skips Context", () => {
		const logger = new Logger({ name: "txt-verb-nz" });
		logger.warnStructured(
			{ code: "V", message: "m", context: { k: 1 } },
			{ format: "text", verbose: -0 as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).not.toContain("Context:");
	});

	it("severity=[] misses LOG_LEVELS → warn icon fallback", () => {
		const logger = new Logger({ name: "sev-arr" });
		logger.warnStructured(
			{ code: "SA", message: "arr", severity: [] as any },
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("🚧 SA arr");
	});

	it("severity=-0 collapses via || to warn icon", () => {
		const logger = new Logger({ name: "sev-nz" });
		logger.warnStructured(
			{ code: "SN", message: "neg", severity: -0 as any },
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("🚧 SN neg");
	});

	it("json timestamp=[] kept via || then spread", () => {
		const logger = new Logger({ name: "ts-arr" });
		logger.warnStructured(
			{ code: "T", message: "m", timestamp: [] as any },
			{ format: "json" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain('"timestamp":[]');
	});

	it.each([
		{ label: "Infinity", format: Number.POSITIVE_INFINITY },
		{ label: "-Infinity", format: Number.NEGATIVE_INFINITY },
	] as const)("opts.format=$label blocks ADK_WARN_FORMAT=json → text", ({
		format,
	}) => {
		process.env.ADK_WARN_FORMAT = "json";
		const logger = new Logger({ name: "fmt-inf" });
		logger.warnStructured(
			{ code: "INF", message: "blocked" },
			{ format: format as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[INF] blocked");
		expect(rendered).not.toContain('"code":"INF"');
	});
});
