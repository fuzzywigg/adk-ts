import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Twentieth leftover residual deepen after tip #289 / #292:
 * nineteenth pinned env `"true"`/`Infinity` format + AGENT_BUILDER strict.
 * Residual: opts.verbose / opts.format / suggestion with `Object(true)` /
 * `Object(1)` / `Object(false)` / `"Infinity"` — boxed false is truthy.
 */
describe("Logger warnStructured verbose/format/suggestion boxed twentieth leftover", () => {
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
		{ label: "Object(true)", verbose: Object(true) },
		{ label: "Object(1)", verbose: Object(1) },
		{ label: "Object(false)", verbose: Object(false) },
		{ label: 'string "Infinity"', verbose: "Infinity" },
	])("verbose=$label enables Context (boxed false truthy)", ({ verbose }) => {
		const logger = new Logger({ name: "ws-verb" });
		logger.warnStructured(
			{ code: "V", message: "m", context: { k: 1 } },
			{ format: "pretty", verbose: verbose as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Context:");
		expect(rendered).toContain("k=1");
	});

	it("verbose=false control still omits Context (primitive twin)", () => {
		const logger = new Logger({ name: "ws-verb-f" });
		logger.warnStructured(
			{ code: "V", message: "m", context: { k: 1 } },
			{ format: "pretty", verbose: false },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).not.toContain("Context:");
	});

	it.each([
		{ label: "Object(true)", format: Object(true) },
		{ label: "Object(1)", format: Object(1) },
		{ label: "Object(false)", format: Object(false) },
		{ label: 'string "Infinity"', format: "Infinity" },
	])("format=$label misses json/pretty → text path", ({ format }) => {
		const logger = new Logger({ name: "ws-fmt" });
		logger.warnStructured(
			{ code: "F", message: "via-boxed" },
			{ format: format as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[F] via-boxed");
		expect(rendered).not.toContain('"code":"F"');
		expect(rendered).not.toContain("🚧 F");
	});

	it.each([
		{ label: "Object(true)", suggestion: Object(true), needle: "true" },
		{ label: "Object(1)", suggestion: Object(1), needle: "1" },
		{ label: "Object(false)", suggestion: Object(false), needle: "false" },
		{ label: 'string "Infinity"', suggestion: "Infinity", needle: "Infinity" },
	])("suggestion=$label kept (boxed false truthy vs primitive false)", ({
		suggestion,
		needle,
	}) => {
		const logger = new Logger({ name: "ws-sug" });
		logger.warnStructured(
			{ code: "S", message: "m", suggestion: suggestion as any },
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Suggestion:");
		expect(rendered).toContain(needle);
	});
});
