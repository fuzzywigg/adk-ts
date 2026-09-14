import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

describe("Logger seventh leftover — warnStructured format '' fallthrough + timestamp ||", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
		ADK_WARN_FORMAT: process.env.ADK_WARN_FORMAT,
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

	it("opts.format='' falls through to ADK_WARN_FORMAT=json via opts.format || env", () => {
		process.env.ADK_WARN_FORMAT = "json";
		const logger = new Logger({ name: "fmt-empty" });
		logger.warnStructured(
			{ code: "E0", message: "empty-opts-format" },
			{ format: "" as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain('"code":"E0"');
		expect(rendered).toContain('"message":"empty-opts-format"');
	});

	it("opts.format='' and empty env fall through to pretty default", () => {
		process.env.ADK_WARN_FORMAT = "";
		const logger = new Logger({ name: "fmt-both-empty" });
		logger.warnStructured(
			{ code: "E1", message: "pretty-default", suggestion: "hint" },
			{ format: "" as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("E1");
		expect(rendered).toContain("• Suggestion: hint");
		expect(rendered).not.toContain('"code":');
		expect(rendered).not.toContain("[E1]");
	});

	it("opts.format='' falls through to ADK_WARN_FORMAT=text", () => {
		process.env.ADK_WARN_FORMAT = "text";
		const logger = new Logger({ name: "fmt-text" });
		logger.warnStructured(
			{ code: "E2", message: "text-via-env", suggestion: "go" },
			{ format: "" as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[E2] text-via-env");
		expect(rendered).toContain("-> go");
	});

	it.each([
		{ label: "undefined", timestamp: undefined },
		{ label: "null", timestamp: null },
		{ label: "empty-string", timestamp: "" },
	] as const)("json explicit timestamp=$label: ...warning overwrites timestamp || ISO auto-fill", ({
		timestamp,
	}) => {
		delete process.env.ADK_WARN_FORMAT;
		const logger = new Logger({ name: "ts-falsy" });
		logger.warnStructured(
			{
				code: "T0",
				message: "ts",
				timestamp: timestamp as any,
			},
			{ format: "json" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		const payload = JSON.parse(rendered.slice(rendered.indexOf("{")));
		if (timestamp === undefined) {
			expect(payload.timestamp).toBeUndefined();
		} else {
			expect(payload.timestamp).toBe(timestamp);
		}
		expect(payload.code).toBe("T0");
	});

	it("json omitted timestamp key keeps timestamp || ISO (spread does not overwrite)", () => {
		const logger = new Logger({ name: "ts-omit" });
		const before = Date.now();
		logger.warnStructured({ code: "T2", message: "auto" }, { format: "json" });
		const after = Date.now();
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		const payload = JSON.parse(rendered.slice(rendered.indexOf("{")));
		const parsed = Date.parse(payload.timestamp);
		expect(parsed).toBeGreaterThanOrEqual(before - 1000);
		expect(parsed).toBeLessThanOrEqual(after + 1000);
	});

	it.each([
		{ label: "JSON", value: "JSON" },
		{ label: "Json", value: "Json" },
		{ label: "json ", value: "json " },
		{ label: "PRETTY", value: "PRETTY" },
		{ label: "Pretty", value: "Pretty" },
	] as const)("ADK_WARN_FORMAT=$label misses json/pretty (strict ===) and falls through to text", ({
		value,
	}) => {
		process.env.ADK_WARN_FORMAT = value;
		const logger = new Logger({ name: "fmt-case" });
		logger.warnStructured(
			{ code: "E3", message: "case-miss", suggestion: "hint" },
			{},
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[E3] case-miss");
		expect(rendered).toContain("-> hint");
		expect(rendered).not.toContain('"code":');
		expect(rendered).not.toContain("• Suggestion:");
	});

	it("ADK_WARN_FORMAT=TEXT still hits text else-branch (TEXT !== pretty)", () => {
		process.env.ADK_WARN_FORMAT = "TEXT";
		const logger = new Logger({ name: "fmt-text-case" });
		logger.warnStructured(
			{ code: "E4", message: "text-case", suggestion: "go" },
			{},
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[E4] text-case");
		expect(rendered).toContain("-> go");
	});

	it("opts.format='JSON' also misses json/pretty and uses text", () => {
		delete process.env.ADK_WARN_FORMAT;
		const logger = new Logger({ name: "fmt-opts-json" });
		logger.warnStructured(
			{ code: "E5", message: "opts-json", suggestion: "hint" },
			{ format: "JSON" as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[E5] opts-json");
		expect(rendered).not.toContain('"code":');
	});

	it.each([
		{ label: "whitespace", timestamp: "   " },
		{ label: "zero-string", timestamp: "0" },
		{ label: "custom", timestamp: "1999-12-31T23:59:59.000Z" },
	] as const)("json timestamp=$label is truthy so || and spread agree", ({
		timestamp,
	}) => {
		const logger = new Logger({ name: "ts-truthy" });
		logger.warnStructured(
			{
				code: "T1",
				message: "ts-keep",
				timestamp,
			},
			{ format: "json" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		const payload = JSON.parse(rendered.slice(rendered.indexOf("{")));
		expect(payload.timestamp).toBe(timestamp);
	});
});
