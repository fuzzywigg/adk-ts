import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Twenty-first leftover residual deepen after tip #292 / 5156762:
 * nineteenth pinned ADK_WARN_FORMAT `"true"`/`Infinity` env text path and
 * ADK_ERROR_STACK_FRAMES `"Infinity"`/`"-Infinity"`/`"1e0"`. Residual:
 * ADK_WARN_FORMAT=`"1"`/`"false"` miss json/pretty → text; stack frames
 * `"Infinity."` → Number NaN (no Stack, like eighteenth `"false"`);
 * `"1."` → Number 1 capped like `"1"`/`"1e0"`.
 */
describe("Logger ADK_WARN_FORMAT/ERROR_STACK_FRAMES string-residual twenty-first residual deepen", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
		ADK_WARN_FORMAT: process.env.ADK_WARN_FORMAT,
		ADK_ERROR_STACK_FRAMES: process.env.ADK_ERROR_STACK_FRAMES,
		ADK_AGENT_BUILDER_WARN: process.env.ADK_AGENT_BUILDER_WARN,
	};

	let Logger: typeof import("../../logger").Logger;
	let warnSpy: ReturnType<typeof vi.spyOn>;
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
		delete process.env.ADK_WARN_FORMAT;
		delete process.env.ADK_ERROR_STACK_FRAMES;
		delete process.env.ADK_AGENT_BUILDER_WARN;
		vi.spyOn(console, "log").mockImplementation(() => {});
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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

	it('ADK_WARN_FORMAT="1" misses json/pretty → text path', () => {
		process.env.ADK_WARN_FORMAT = "1";
		const logger = new Logger({ name: "env-fmt-1" });
		logger.warnStructured({ code: "ONE", message: "via-1" });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[ONE] via-1");
		expect(rendered).not.toContain('"code":"ONE"');
		expect(rendered).not.toContain("🚧 ONE");
	});

	it('ADK_WARN_FORMAT="false" misses json/pretty → text path', () => {
		process.env.ADK_WARN_FORMAT = "false";
		const logger = new Logger({ name: "env-fmt-false" });
		logger.warnStructured({ code: "F", message: "via-false" });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[F] via-false");
		expect(rendered).not.toContain('"code":"F"');
	});

	it('ADK_ERROR_STACK_FRAMES="Infinity." → Number NaN: no Stack section', () => {
		process.env.ADK_ERROR_STACK_FRAMES = "Infinity.";
		const logger = new Logger({ name: "stack-inf-dot" });
		logger.error("failed", makeStackedError());
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("BoomError: boom");
		expect(rendered).not.toContain("• Stack:");
		expect(rendered).not.toContain("↳ first");
	});

	it('ADK_ERROR_STACK_FRAMES="1." → Number 1 caps like "1"/"1e0"', () => {
		process.env.ADK_ERROR_STACK_FRAMES = "1.";
		const logger = new Logger({ name: "stack-1-dot" });
		logger.error("failed", makeStackedError());
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Stack:");
		expect(rendered).toContain("↳ first");
		expect(rendered).not.toContain("↳ second");
		expect(rendered).toContain("↳ … 2 more frames");
	});

	it('ADK_AGENT_BUILDER_WARN="Infinity" does not enable Context (not === "verbose")', () => {
		process.env.ADK_AGENT_BUILDER_WARN = "Infinity";
		const logger = new Logger({ name: "abw-inf" });
		logger.warnStructured(
			{ code: "V", message: "m", context: { k: 1 } },
			{ format: "pretty" },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("🚧 V m");
		expect(rendered).not.toContain("Context:");
	});
});
