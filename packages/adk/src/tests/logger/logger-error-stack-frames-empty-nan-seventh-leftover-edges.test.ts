import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

describe("Logger seventh leftover — ADK_ERROR_STACK_FRAMES empty/NaN Number() edges", () => {
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

	it("ADK_ERROR_STACK_FRAMES='' → Number('')===0 shows only '… N more frames' (same as '0')", () => {
		process.env.ADK_ERROR_STACK_FRAMES = "";
		const logger = new Logger({ name: "stack-empty" });
		logger.error("failed", makeStackedError());
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("BoomError: boom");
		expect(rendered).toContain("• Stack:");
		expect(rendered).toContain("↳ … 3 more frames");
		expect(rendered).not.toContain("↳ first");
		expect(rendered).not.toContain("↳ second");
	});

	it("ADK_ERROR_STACK_FRAMES='abc' → Number NaN: slice empty and totalFrames>NaN is false so no Stack", () => {
		process.env.ADK_ERROR_STACK_FRAMES = "abc";
		const logger = new Logger({ name: "stack-nan" });
		logger.error("failed", makeStackedError());
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("BoomError: boom");
		expect(rendered).not.toContain("• Stack:");
		expect(rendered).not.toContain("↳ first");
	});

	it("ADK_ERROR_STACK_FRAMES unset keeps Infinity and shows frames", () => {
		delete process.env.ADK_ERROR_STACK_FRAMES;
		const logger = new Logger({ name: "stack-unset" });
		logger.error("failed", makeStackedError());
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Stack:");
		expect(rendered).toContain("↳ first");
		expect(rendered).toContain("↳ second");
		expect(rendered).toContain("↳ third");
	});

	it("ADK_ERROR_STACK_FRAMES='2' caps frames (control vs empty/NaN)", () => {
		process.env.ADK_ERROR_STACK_FRAMES = "2";
		const logger = new Logger({ name: "stack-two" });
		logger.error("failed", makeStackedError());
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Stack:");
		expect(rendered).toContain("↳ first");
		expect(rendered).toContain("↳ second");
		expect(rendered).not.toContain("↳ third");
	});

	it("whitespace-only ADK_ERROR_STACK_FRAMES → Number('   ')===0 like empty/'0'", () => {
		process.env.ADK_ERROR_STACK_FRAMES = "   ";
		const logger = new Logger({ name: "stack-ws" });
		logger.error("failed", makeStackedError());
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("BoomError: boom");
		expect(rendered).toContain("• Stack:");
		expect(rendered).toContain("↳ … 3 more frames");
		expect(rendered).not.toContain("↳ first");
	});
});
