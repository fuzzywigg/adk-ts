import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Leftover: after trim, `filter(Boolean)` drops whitespace-only stack frames
 * before `slice(0, maxFrames)`. Distinct from ADK_ERROR_STACK_FRAMES Number()
 * empty/NaN coercion covered in seventh leftover.
 */
describe("Logger stack whitespace filter(Boolean) leftover edges", () => {
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

	beforeEach(async () => {
		for (const [key, value] of Object.entries(originalEnv)) {
			restoreEnvKey(key, value);
		}
		process.env.NODE_ENV = "production";
		delete process.env.ADK_FORCE_BOXES;
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
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

	it("filter(Boolean) drops whitespace-only frames after trim", () => {
		process.env.ADK_ERROR_STACK_FRAMES = "5";
		const logger = new Logger({ name: "stack-ws" });
		const err = new Error("ws-boom");
		err.stack = [
			"Error: ws-boom",
			"    at keep (file.ts:1:1)",
			"   ",
			"\t\t",
			"    at also (file.ts:2:2)",
			"",
		].join("\n");

		logger.error("failed", err);
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("↳ keep (file.ts:1:1)");
		expect(rendered).toContain("↳ also (file.ts:2:2)");
		expect(rendered).not.toMatch(/↳\s*\n/);
	});

	it("whitespace-only frames do not count toward maxFrames cap", () => {
		process.env.ADK_ERROR_STACK_FRAMES = "1";
		const logger = new Logger({ name: "stack-ws-cap" });
		const err = new Error("cap-boom");
		err.stack = [
			"Error: cap-boom",
			"   ",
			"    at first (a.ts:1:1)",
			"    at second (b.ts:2:2)",
		].join("\n");

		logger.error("failed", err);
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("↳ first (a.ts:1:1)");
		expect(rendered).not.toContain("↳ second");
		// totalFrames = split length - 1 includes the whitespace line before filter
		expect(rendered).toContain("more frames");
	});

	it("Error with empty stack string skips Stack section (falsy stack gate)", () => {
		delete process.env.ADK_ERROR_STACK_FRAMES;
		const logger = new Logger({ name: "stack-empty-str" });
		const err = new Error("no-stack");
		err.stack = "";
		logger.error("failed", err);
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Error: no-stack");
		expect(rendered).not.toContain("• Stack:");
	});

	it("Error with undefined stack skips Stack section", () => {
		delete process.env.ADK_ERROR_STACK_FRAMES;
		const logger = new Logger({ name: "stack-undef" });
		const err = new Error("undef-stack");
		err.stack = undefined;
		logger.error("failed", err);
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Error: undef-stack");
		expect(rendered).not.toContain("• Stack:");
	});
});
