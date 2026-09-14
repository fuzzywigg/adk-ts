import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

describe("Logger seventh leftover — warnStructured suggestion falsy + extractMeta !arg", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
	};

	let Logger: typeof import("../../logger").Logger;
	let warnSpy: ReturnType<typeof vi.spyOn>;
	let debugSpy: ReturnType<typeof vi.spyOn>;

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
		debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
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
		{ label: "empty-string", suggestion: "" },
		{ label: "0", suggestion: 0 },
		{ label: "false", suggestion: false },
		{ label: "null", suggestion: null },
		{ label: "undefined", suggestion: undefined },
	] as const)("pretty omits Suggestion line when suggestion=$label", ({
		suggestion,
	}) => {
		const logger = new Logger({ name: "sug-pretty" });
		logger.warnStructured(
			{
				code: "S0",
				message: "no-hint",
				suggestion: suggestion as any,
			},
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("S0");
		expect(rendered).toContain("no-hint");
		expect(rendered).not.toContain("Suggestion:");
	});

	it.each([
		{ label: "empty-string", suggestion: "" },
		{ label: "0", suggestion: 0 },
		{ label: "false", suggestion: false },
	] as const)("text omits arrow suggestion when suggestion=$label", ({
		suggestion,
	}) => {
		const logger = new Logger({ name: "sug-text" });
		logger.warnStructured(
			{
				code: "S1",
				message: "plain",
				suggestion: suggestion as any,
			},
			{ format: "text" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[S1] plain");
		expect(rendered).not.toContain("->");
	});

	it("pretty keeps Suggestion for whitespace-only truthy suggestion", () => {
		const logger = new Logger({ name: "sug-ws" });
		logger.warnStructured(
			{
				code: "S2",
				message: "ws",
				suggestion: "   ",
			},
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Suggestion:    ");
	});

	it.each([
		{ label: "null", arg: null },
		{ label: "undefined", arg: undefined },
		{ label: "0", arg: 0 },
		{ label: "false", arg: false },
		{ label: "empty-string", arg: "" },
	] as const)("extractMeta/formatArgs skip falsy arg=$label via if (!arg) continue", ({
		arg,
	}) => {
		const logger = new Logger({ name: "meta-skip" });
		logger.info("keep", arg as any, { keep: true });
		const rendered = stripAnsi(String(debugSpy.mock.calls[0][0]));
		expect(rendered).toContain("keep");
		expect(rendered).toContain('"keep":true');
		expect(rendered).not.toContain("• null");
		expect(rendered).not.toContain("• undefined");
		expect(rendered).not.toContain("• 0");
		expect(rendered).not.toContain("• false");
		expect(rendered).not.toContain('• ""');
	});

	it("log meta suggestion falsy omits Suggestion line on warn", () => {
		const logger = new Logger({ name: "meta-sug" });
		logger.warn("w", { suggestion: "", context: { a: 1 } });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Context:");
		expect(rendered).toContain("a=1");
		expect(rendered).not.toContain("Suggestion:");
	});

	it.each([
		{ label: "empty object", context: {} },
		{ label: "null", context: null },
		{ label: "0", context: 0 },
		{ label: "false", context: false },
	] as const)("log meta context=$label omits Context line (keys length / falsy)", ({
		context,
	}) => {
		const logger = new Logger({ name: "meta-ctx" });
		logger.warn("w", { suggestion: "keep", context: context as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Suggestion: keep");
		expect(rendered).not.toContain("Context:");
	});
});
