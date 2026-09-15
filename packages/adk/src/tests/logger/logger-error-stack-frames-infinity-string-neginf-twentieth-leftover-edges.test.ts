import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Twentieth leftover residual after tip #279 / 1f70668 (#282):
 * seventh/eighteenth pinned empty/`abc`/`true`/`false` Number() NaN/0.
 * Residual: ADK_ERROR_STACK_FRAMES `"Infinity"` → Infinity (all frames);
 * `"-Infinity"` → ellipsis-only Stack; `"1e0"` → capped like `"1"`.
 */
describe("Logger ADK_ERROR_STACK_FRAMES Infinity/-Infinity/1e0 twentieth leftover", () => {
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

	it('ADK_ERROR_STACK_FRAMES="Infinity" → Number Infinity: all frames, no ellipsis', () => {
		process.env.ADK_ERROR_STACK_FRAMES = "Infinity";
		const logger = new Logger({ name: "stack-inf" });
		logger.error("failed", makeStackedError());
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Stack:");
		expect(rendered).toContain("↳ first");
		expect(rendered).toContain("↳ second");
		expect(rendered).toContain("↳ third");
		expect(rendered).not.toContain("more frames");
	});

	it('ADK_ERROR_STACK_FRAMES="-Infinity" → slice empty + ellipsis Infinity more', () => {
		process.env.ADK_ERROR_STACK_FRAMES = "-Infinity";
		const logger = new Logger({ name: "stack-neginf" });
		logger.error("failed", makeStackedError());
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Stack:");
		expect(rendered).toContain("↳ … Infinity more frames");
		expect(rendered).not.toContain("↳ first");
		expect(rendered).not.toContain("↳ second");
	});

	it('ADK_ERROR_STACK_FRAMES="1e0" → Number 1 caps like "1"', () => {
		process.env.ADK_ERROR_STACK_FRAMES = "1e0";
		const logger = new Logger({ name: "stack-1e0" });
		logger.error("failed", makeStackedError());
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Stack:");
		expect(rendered).toContain("↳ first");
		expect(rendered).not.toContain("↳ second");
		expect(rendered).toContain("↳ … 2 more frames");
	});
});
