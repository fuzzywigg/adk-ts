import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

describe("Logger seventh leftover — ADK_AGENT_BUILDER_WARN === 'verbose' + opts.verbose falsy", () => {
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
		{ label: "VERBOSE", value: "VERBOSE" },
		{ label: "Verbose", value: "Verbose" },
		{ label: "true", value: "true" },
		{ label: "1", value: "1" },
		{ label: "empty", value: "" },
		{ label: "verbose ", value: "verbose " },
	] as const)("env ADK_AGENT_BUILDER_WARN=$label does not enable Context (strict === 'verbose')", ({
		value,
	}) => {
		process.env.ADK_AGENT_BUILDER_WARN = value;
		const logger = new Logger({ name: "abw-case" });
		logger.warnStructured(
			{
				code: "C",
				message: "m",
				context: { k: 1 },
			},
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).not.toContain("Context:");
		expect(rendered).not.toContain("k=1");
	});

	it("exact ADK_AGENT_BUILDER_WARN='verbose' enables Context without opts.verbose", () => {
		process.env.ADK_AGENT_BUILDER_WARN = "verbose";
		const logger = new Logger({ name: "abw-exact" });
		logger.warnStructured(
			{
				code: "C",
				message: "m",
				context: { k: 2 },
			},
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Context:");
		expect(rendered).toContain("k=2");
	});

	it.each([
		{ label: "false", verbose: false as boolean | number | string },
		{ label: "0", verbose: 0 },
		{ label: "empty-string", verbose: "" },
	] as const)("opts.verbose=$label is falsy so env case-mismatch still omits Context", ({
		verbose,
	}) => {
		process.env.ADK_AGENT_BUILDER_WARN = "VERBOSE";
		const logger = new Logger({ name: "abw-opts" });
		logger.warnStructured(
			{
				code: "C",
				message: "m",
				context: { k: 3 },
			},
			{ format: "pretty", verbose: verbose as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).not.toContain("Context:");
	});

	it("opts.verbose=true wins even when env is case-mismatched", () => {
		process.env.ADK_AGENT_BUILDER_WARN = "VERBOSE";
		const logger = new Logger({ name: "abw-opts-true" });
		logger.warnStructured(
			{
				code: "C",
				message: "m",
				context: { k: 4 },
			},
			{ format: "pretty", verbose: true },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("k=4");
	});

	it("text format also requires exact env 'verbose' for Context", () => {
		process.env.ADK_AGENT_BUILDER_WARN = "Verbose";
		const logger = new Logger({ name: "abw-text" });
		logger.warnStructured(
			{
				code: "T1",
				message: "text-msg",
				context: { a: 9 },
			},
			{ format: "text" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[T1] text-msg");
		expect(rendered).not.toContain("Context:");
	});
});
