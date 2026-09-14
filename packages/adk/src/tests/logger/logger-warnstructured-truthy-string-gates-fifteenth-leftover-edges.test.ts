import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Fifteenth leftover: string-vs-primitive truthiness asymmetry in
 * warnStructured — `"0"`/`"false"`/`" "` are truthy for `opts.verbose ||`
 * and `if (warning.suggestion)`, while numeric `0`/`false`/`""` (seventh)
 * omit. Also `opts.format` falsy `0`/`false` fall through via `||` to env.
 */
describe("Logger warnStructured truthy-string gates fifteenth leftover", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
		ADK_AGENT_BUILDER_WARN: process.env.ADK_AGENT_BUILDER_WARN,
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
		delete process.env.ADK_AGENT_BUILDER_WARN;
		delete process.env.ADK_WARN_FORMAT;
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
		{ label: '"0"', verbose: "0" },
		{ label: '"false"', verbose: "false" },
		{ label: "space", verbose: " " },
	] as const)("opts.verbose=$label truthy string enables Context without exact env", ({
		verbose,
	}) => {
		const logger = new Logger({ name: "abw-str-verbose" });
		logger.warnStructured(
			{
				code: "C",
				message: "m",
				context: { k: 1 },
			},
			{ format: "pretty", verbose: verbose as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Context:");
		expect(rendered).toContain("k=1");
	});

	it.each([
		{ label: '"0"', suggestion: "0" },
		{ label: '"false"', suggestion: "false" },
	] as const)("pretty keeps Suggestion when suggestion=$label (truthy string)", ({
		suggestion,
	}) => {
		const logger = new Logger({ name: "sug-str-pretty" });
		logger.warnStructured(
			{
				code: "S0",
				message: "hinted",
				suggestion,
			},
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain(`• Suggestion: ${suggestion}`);
	});

	it.each([
		{ label: '"0"', suggestion: "0" },
		{ label: '"false"', suggestion: "false" },
	] as const)("text keeps arrow suggestion when suggestion=$label (truthy string)", ({
		suggestion,
	}) => {
		const logger = new Logger({ name: "sug-str-text" });
		logger.warnStructured(
			{
				code: "S1",
				message: "plain",
				suggestion,
			},
			{ format: "text" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[S1] plain");
		expect(rendered).toContain(`-> ${suggestion}`);
	});

	it("opts.format=0 falsy falls through to ADK_WARN_FORMAT=json", () => {
		process.env.ADK_WARN_FORMAT = "json";
		const logger = new Logger({ name: "fmt-0" });
		logger.warnStructured(
			{ code: "F0", message: "via-env" },
			{ format: 0 as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain('"code":"F0"');
		expect(rendered).toContain('"message":"via-env"');
	});

	it("opts.format=false falsy falls through to ADK_WARN_FORMAT=text", () => {
		process.env.ADK_WARN_FORMAT = "text";
		const logger = new Logger({ name: "fmt-false" });
		logger.warnStructured(
			{ code: "F1", message: "via-env", suggestion: "hint" },
			{ format: false as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[F1] via-env");
		expect(rendered).toContain("-> hint");
	});
});
