import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Twenty-first leftover residual deepen after tip #292 / 5156762:
 * eighteenth pinned formatArgs/extractMeta true/`"true"`/`[]`/±Infinity/`-0`.
 * Residual: string `"Infinity"` / `Object(1)` / `Object(false)` kept via
 * `!arg` / `if (meta.suggestion)` (boxed false is truthy).
 */
describe("Logger formatArgs/extractMeta string-infinity/object-one/object-false twenty-first residual deepen", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
	};

	let Logger: typeof import("../../logger").Logger;
	let debugSpy: ReturnType<typeof vi.spyOn>;
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
		debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
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
		{ label: '"Infinity"', value: "Infinity", needle: "• Infinity" },
		{ label: "Object(1)", value: Object(1), needle: "• 1" },
		{ label: "Object(false)", value: Object(false), needle: "• false" },
	] as const)("info keeps truthy residual arg $label via !arg", ({
		value,
		needle,
	}) => {
		const logger = new Logger({ name: "fmt-21-keep" });
		logger.info("m", value as any, { x: 1 });
		const rendered = stripAnsi(String(debugSpy.mock.calls[0][0]));
		expect(rendered).toContain(needle);
		expect(rendered).toContain('"x":1');
	});

	it.each([
		{ label: '"Infinity"', suggestion: "Infinity" },
		{ label: "Object(1)", suggestion: Object(1) },
		{ label: "Object(false)", suggestion: Object(false) },
	] as const)("extractMeta keeps suggestion=$label (truthy residual)", ({
		suggestion,
	}) => {
		const logger = new Logger({ name: "meta-21-sug" });
		logger.warn("hinted", { suggestion: suggestion as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Suggestion:");
	});
});
