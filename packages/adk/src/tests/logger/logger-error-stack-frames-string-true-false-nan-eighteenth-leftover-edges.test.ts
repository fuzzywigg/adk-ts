import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Eighteenth leftover (logger/env residual): ADK_ERROR_STACK_FRAMES `"true"` / `"false"` →
 * Number() NaN (same empty-stack outcome as seventh `"abc"`, but string-bool
 * residual after seventeenth string-zero-false wave elsewhere).
 */
describe("Logger ADK_ERROR_STACK_FRAMES string true/false NaN eighteenth leftover", () => {
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

	it.each([
		{ label: '"false"', value: "false" },
		{ label: '"true"', value: "true" },
	] as const)("ADK_ERROR_STACK_FRAMES=$label → Number NaN: no Stack section", ({
		value,
	}) => {
		process.env.ADK_ERROR_STACK_FRAMES = value;
		const logger = new Logger({ name: "stack-str-bool" });
		logger.error("failed", makeStackedError());
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("BoomError: boom");
		expect(rendered).not.toContain("• Stack:");
		expect(rendered).not.toContain("↳ first");
	});

	it("ADK_ERROR_STACK_FRAMES='1' control still shows capped frame", () => {
		process.env.ADK_ERROR_STACK_FRAMES = "1";
		const logger = new Logger({ name: "stack-one-ctrl" });
		logger.error("failed", makeStackedError());
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Stack:");
		expect(rendered).toContain("↳ first");
		expect(rendered).not.toContain("↳ second");
		expect(rendered).toContain("↳ … 2 more frames");
	});
});
