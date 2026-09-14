import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Tenth leftover: `Number(ADK_ERROR_STACK_FRAMES)` NaN path + `filter(Boolean)`
 * after trim drops whitespace-only frames. Distinct from logger.test 0/unset.
 */
describe("Logger ADK_ERROR_STACK_FRAMES NaN / whitespace tenth leftover (post #176)", () => {
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

	it.each([
		"abc",
		"frames",
		"NaN",
	] as const)('ADK_ERROR_STACK_FRAMES=%j → Number NaN → slice(0, NaN) yields no frames (no "more frames")', (raw) => {
		process.env.ADK_ERROR_STACK_FRAMES = raw;
		const logger = new Logger({ name: "stack-nan" });
		const err = new Error("nan-boom");
		err.stack = [
			"Error: nan-boom",
			"    at one (file.ts:1:1)",
			"    at two (file.ts:2:2)",
		].join("\n");

		logger.error("failed", err);
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Error: nan-boom");
		expect(rendered).not.toContain("↳ one");
		expect(rendered).not.toContain("more frames");
	});

	it('ADK_ERROR_STACK_FRAMES="" → Number("")===0: no frames, only "more frames" footer', () => {
		process.env.ADK_ERROR_STACK_FRAMES = "";
		const logger = new Logger({ name: "stack-empty" });
		const err = new Error("empty-frames");
		err.stack = [
			"Error: empty-frames",
			"    at one (file.ts:1:1)",
			"    at two (file.ts:2:2)",
		].join("\n");

		logger.error("failed", err);
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Error: empty-frames");
		expect(rendered).toContain("• Stack:");
		expect(rendered).toContain("↳ … 2 more frames");
		expect(rendered).not.toContain("↳ one");
		expect(rendered).not.toContain("↳ two");
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
		// No bare empty frame lines between stack entries
		expect(rendered).not.toMatch(/↳\s*\n/);
	});

	it("falsy 0/false/'' args skipped via if (!arg) continue in formatArgs", () => {
		delete process.env.ADK_ERROR_STACK_FRAMES;
		const logger = new Logger({ name: "falsy-args" });
		logger.error("msg", 0 as any, false as any, "" as any, "kept");
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• kept");
		expect(rendered).not.toContain("• 0");
		expect(rendered).not.toContain("• false");
	});
});
