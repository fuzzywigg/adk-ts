import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Twentieth leftover residual deepen after tip #289 / #292:
 * eighteenth pinned extractMeta context true/`"true"`/`[]`/`-0`/`1`.
 * Residual: warn() extractMeta with `Object(true)` / `Object(1)` /
 * `Object(false)` omit; `"Infinity"` char-index Context.
 */
describe("Logger extractMeta context object-true/one/false/infinity twentieth leftover", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
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
		vi.spyOn(console, "debug").mockImplementation(() => {});
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
		{ label: "Object(true)", context: Object(true) },
		{ label: "Object(1)", context: Object(1) },
		{ label: "Object(false)", context: Object(false) },
	])("context=$label → Object.keys empty → omit Context", ({ context }) => {
		const logger = new Logger({ name: "em-omit" });
		logger.warn("m", { context: context as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("m");
		expect(rendered).not.toContain("• Context:");
	});

	it('context="Infinity" → char-index Context entries', () => {
		const logger = new Logger({ name: "em-inf" });
		logger.warn("m", { context: "Infinity" as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Context:");
		expect(rendered).toContain("0=I");
		expect(rendered).toContain("1=n");
		expect(rendered).toContain("7=y");
	});

	it.each([
		{ label: "Object(true)", suggestion: Object(true), needle: "true" },
		{ label: "Object(false)", suggestion: Object(false), needle: "false" },
		{ label: 'string "Infinity"', suggestion: "Infinity", needle: "Infinity" },
	])("suggestion=$label kept via extractMeta (boxed false truthy)", ({
		suggestion,
		needle,
	}) => {
		const logger = new Logger({ name: "em-sug" });
		logger.warn("m", { suggestion: suggestion as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Suggestion:");
		expect(rendered).toContain(needle);
	});
});
