import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Nineteenth leftover residual deepen after tip #289 / f93c037:
 * tip pinned ADK_ERROR_STACK_FRAMES `"Infinity"` / `"-Infinity"` / `"1e0"`.
 * Residual: `"+Infinity"` twin; `"1.0"` / `"1e+0"` cap like `"1e0"`; `"0e0"` →
 * ellipsis-only like empty/`"0"`.
 */
describe("Logger ADK_ERROR_STACK_FRAMES +Infinity/1.0/0e0 nineteenth residual deepen", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
		ADK_ERROR_STACK_FRAMES: process.env.ADK_ERROR_STACK_FRAMES,
	};

	let Logger: typeof import("../../logger").Logger;
	let errorSpy: ReturnType<typeof vi.spyOn>;

	function restoreEnvKey(key: string, value: string | undefined): void {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	function makeStackedError(): Error {
		const err = new Error("boom");
		err.name = "BoomError";
		err.stack = [
			"BoomError: boom",
			"    at first (a.ts:1:1)",
			"    at second (b.ts:2:2)",
			"    at third (c.ts:3:3)",
		].join("\n");
		return err;
	}

	beforeEach(async () => {
		for (const [key, value] of Object.entries(originalEnv)) {
			restoreEnvKey(key, value);
		}
		process.env.NODE_ENV = "production";
		delete process.env.ADK_FORCE_BOXES;
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.resetModules();
		({ Logger } = await import("../../logger"));
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(originalEnv)) {
			restoreEnvKey(key, value);
		}
		vi.restoreAllMocks();
	});

	it('ADK_ERROR_STACK_FRAMES="+Infinity" → Number Infinity: all frames, no ellipsis', () => {
		process.env.ADK_ERROR_STACK_FRAMES = "+Infinity";
		const logger = new Logger({ name: "stack-plus-inf" });
		logger.error("failed", makeStackedError());
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Stack:");
		expect(rendered).toContain("↳ first");
		expect(rendered).toContain("↳ second");
		expect(rendered).toContain("↳ third");
		expect(rendered).not.toContain("more frames");
	});

	it.each([
		{ label: '"1.0"', value: "1.0" },
		{ label: '"1e+0"', value: "1e+0" },
	] as const)("ADK_ERROR_STACK_FRAMES=$label → Number 1 caps like tip 1e0", ({
		value,
	}) => {
		process.env.ADK_ERROR_STACK_FRAMES = value;
		const logger = new Logger({ name: "stack-1dot" });
		logger.error("failed", makeStackedError());
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Stack:");
		expect(rendered).toContain("↳ first");
		expect(rendered).not.toContain("↳ second");
		expect(rendered).toContain("↳ … 2 more frames");
	});

	it('ADK_ERROR_STACK_FRAMES="0e0" → Number 0: ellipsis-only Stack', () => {
		process.env.ADK_ERROR_STACK_FRAMES = "0e0";
		const logger = new Logger({ name: "stack-0e0" });
		logger.error("failed", makeStackedError());
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Stack:");
		expect(rendered).toContain("↳ … 3 more frames");
		expect(rendered).not.toContain("↳ first");
		expect(rendered).not.toContain("↳ second");
	});
});
