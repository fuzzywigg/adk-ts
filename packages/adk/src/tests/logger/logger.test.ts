import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

describe("Logger", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_DEBUG: process.env.ADK_DEBUG,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
		ADK_ERROR_STACK_FRAMES: process.env.ADK_ERROR_STACK_FRAMES,
		ADK_WARN_FORMAT: process.env.ADK_WARN_FORMAT,
		ADK_AGENT_BUILDER_WARN: process.env.ADK_AGENT_BUILDER_WARN,
	};
	const originalColumns = process.stdout.columns;

	let Logger: typeof import("../../logger").Logger;
	let isDebugEnabled: typeof import("../../logger").isDebugEnabled;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let debugSpy: ReturnType<typeof vi.spyOn>;
	let warnSpy: ReturnType<typeof vi.spyOn>;
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
		process.stdout.columns = 120;

		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		vi.resetModules();
		({ Logger, isDebugEnabled } = await import("../../logger"));
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(originalEnv)) {
			restoreEnvKey(key, value);
		}
		process.stdout.columns = originalColumns;
		vi.restoreAllMocks();
	});

	describe("isDebugEnabled", () => {
		it("is true when NODE_ENV is development", async () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_DEBUG;
			vi.resetModules();
			({ isDebugEnabled } = await import("../../logger"));
			expect(isDebugEnabled()).toBe(true);
		});

		it("is true when ADK_DEBUG is true", async () => {
			process.env.NODE_ENV = "production";
			process.env.ADK_DEBUG = "true";
			vi.resetModules();
			({ isDebugEnabled } = await import("../../logger"));
			expect(isDebugEnabled()).toBe(true);
		});

		it("is false when neither development nor ADK_DEBUG", async () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_DEBUG;
			vi.resetModules();
			({ isDebugEnabled } = await import("../../logger"));
			expect(isDebugEnabled()).toBe(false);
		});

		it("captures isDebugEnabled on construction from env", async () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_DEBUG;
			vi.resetModules();
			({ Logger } = await import("../../logger"));
			expect(new Logger({ name: "env-debug" }).isDebugEnabled).toBe(true);

			process.env.NODE_ENV = "production";
			delete process.env.ADK_DEBUG;
			vi.resetModules();
			({ Logger } = await import("../../logger"));
			expect(new Logger({ name: "env-quiet" }).isDebugEnabled).toBe(false);
		});
	});

	describe("level routing and gating", () => {
		it("stores the logger name", () => {
			const logger = new Logger({ name: "unit-logger" });
			expect(logger.name).toBe("unit-logger");
		});

		it("routes info to console.debug with name and message", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "router" });
			logger.info("hello-info");

			expect(debugSpy).toHaveBeenCalledTimes(1);
			const rendered = stripAnsi(String(debugSpy.mock.calls[0][0]));
			expect(rendered).toContain("[router]");
			expect(rendered).toContain("hello-info");
			expect(rendered).toContain("ℹ️");
		});

		it("routes warn to console.warn and error to console.error", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "router" });
			logger.warn("careful");
			logger.error("boom");

			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(errorSpy).toHaveBeenCalledTimes(1);
			expect(stripAnsi(String(warnSpy.mock.calls[0][0]))).toContain("careful");
			expect(stripAnsi(String(errorSpy.mock.calls[0][0]))).toContain("boom");
		});

		it("skips debug output when isDebugEnabled is false", () => {
			const logger = new Logger({ name: "quiet" });
			logger.isDebugEnabled = false;
			logger.debug("hidden");
			expect(logSpy).not.toHaveBeenCalled();
		});

		it("emits debug via console.log when enabled", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "dbg" });
			logger.isDebugEnabled = true;
			logger.debug("visible-detail");

			expect(logSpy).toHaveBeenCalledTimes(1);
			const rendered = stripAnsi(String(logSpy.mock.calls[0][0]));
			expect(rendered).toContain("[dbg]");
			expect(rendered).toContain("visible-detail");
			expect(rendered).toContain("🐛");
		});
	});

	describe("production vs boxed formatting", () => {
		it("uses simple production format without box characters", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "prod" });
			logger.warn("careful", {
				suggestion: "retry",
				context: { code: 1 },
			});

			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).not.toContain("┌");
			expect(rendered).toContain("[prod]");
			expect(rendered).toContain("careful");
			expect(rendered).toContain("• Suggestion: retry");
			expect(rendered).toContain("• Context: code=1");
		});

		it("skips empty context objects in production meta lines", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "prod" });
			logger.warn("only-suggestion", {
				suggestion: "try again",
				context: {},
			});

			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("• Suggestion: try again");
			expect(rendered).not.toContain("• Context:");
		});

		it("boxes warn and error outside production with capitalized titles", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "boxed" });
			logger.warn("watch out");
			logger.error("failed hard");

			const warnOut = stripAnsi(String(warnSpy.mock.calls[0][0]));
			const errorOut = stripAnsi(String(errorSpy.mock.calls[0][0]));
			expect(warnOut).toContain("┌");
			expect(warnOut).toContain("Warn @");
			expect(warnOut).toContain("(boxed)");
			expect(warnOut).toContain("watch out");
			expect(errorOut).toContain("┌");
			expect(errorOut).toContain("Error @");
			expect(errorOut).toContain("failed hard");
		});

		it("keeps info and debug simple (unboxed) outside production", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "simple" });
			logger.isDebugEnabled = true;
			logger.info("plain-info");
			logger.debug("plain-debug");

			const infoOut = stripAnsi(String(debugSpy.mock.calls[0][0]));
			const debugOut = stripAnsi(String(logSpy.mock.calls[0][0]));
			expect(infoOut).not.toContain("┌");
			expect(infoOut).toContain("[simple]");
			expect(infoOut).toContain("plain-info");
			expect(debugOut).not.toContain("┌");
			expect(debugOut).toContain("plain-debug");
		});

		it("forces boxed output in production when ADK_FORCE_BOXES is true", () => {
			process.env.NODE_ENV = "production";
			process.env.ADK_FORCE_BOXES = "true";
			const logger = new Logger({ name: "forced" });
			logger.warn("still boxed");

			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("┌");
			expect(rendered).toContain("Warn @");
			expect(rendered).toContain("still boxed");
		});
	});

	describe("extractMeta and formatArgs", () => {
		it("takes the first meta object and keeps later meta as args", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "meta" });
			logger.warn(
				"msg",
				{ suggestion: "first", context: { a: 1 } },
				{ suggestion: "second", context: { b: 2 } },
			);

			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("• Suggestion: first");
			expect(rendered).toContain("• Context: a=1");
			expect(rendered).toContain('"suggestion":"second"');
			expect(rendered).not.toContain("• Suggestion: second");
		});

		it("skips falsy args and treats Error separately from meta", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "meta" });
			logger.warn(
				"msg",
				null,
				undefined,
				0,
				"",
				new Error("boom"),
				{ suggestion: "fix" },
				{ plain: true },
			);

			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("• Suggestion: fix");
			expect(rendered).toContain("• Error: boom");
			expect(rendered).toContain('"plain":true');
			expect(rendered).not.toContain("• Stack:");
		});

		it("includes truncated stack frames only for error level", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			process.env.ADK_ERROR_STACK_FRAMES = "2";
			const logger = new Logger({ name: "stack" });
			const err = new Error("stack-boom");
			err.stack = [
				"Error: stack-boom",
				`    at first (${process.cwd()}/src/a.ts:1:1)`,
				`    at second (${process.cwd()}/src/b.ts:2:2)`,
				`    at third (${process.cwd()}/src/c.ts:3:3)`,
			].join("\n");

			logger.error("failed", err);
			const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
			expect(rendered).toContain("• Error: stack-boom");
			expect(rendered).toContain("• Stack:");
			expect(rendered).toContain("↳ first (./src/a.ts:1:1)");
			expect(rendered).toContain("↳ second (./src/b.ts:2:2)");
			expect(rendered).toContain("↳ … 1 more frames");
			expect(rendered).not.toContain("third");
		});

		it("includes full stack when ADK_ERROR_STACK_FRAMES is unset", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			delete process.env.ADK_ERROR_STACK_FRAMES;
			const logger = new Logger({ name: "stack-full" });
			const err = new Error("full");
			err.stack = [
				"Error: full",
				"    at one (file.ts:1:1)",
				"    at two (file.ts:2:2)",
				"    at three (file.ts:3:3)",
			].join("\n");

			logger.error("failed", err);
			const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
			expect(rendered).toContain("↳ one (file.ts:1:1)");
			expect(rendered).toContain("↳ two (file.ts:2:2)");
			expect(rendered).toContain("↳ three (file.ts:3:3)");
			expect(rendered).not.toContain("more frames");
		});

		it("stringifies primitives and circular objects safely", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "stringify" });
			const circular: Record<string, unknown> = { ok: true };
			circular.self = circular;

			logger.info("values", "text", 42, { a: 1 }, circular, {
				context: {
					flag: false,
					empty: null,
					missing: undefined,
					label: "ok",
				},
			});
			const rendered = stripAnsi(String(debugSpy.mock.calls[0][0]));
			expect(rendered).toContain("• text");
			expect(rendered).toContain("• 42");
			expect(rendered).toContain('• {"a":1}');
			expect(rendered).toContain("• [object Object]");
			expect(rendered).toContain("flag=false");
			expect(rendered).toContain("empty=null");
			expect(rendered).toContain("missing=undefined");
			expect(rendered).toContain("label=ok");
		});

		it("appends non-error extra args under info as bullet lines", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "args" });
			logger.info("header", { nested: [1, 2] });
			const rendered = stripAnsi(String(debugSpy.mock.calls[0][0]));
			expect(rendered.split("\n")[0]).toContain("header");
			expect(rendered).toContain('• {"nested":[1,2]}');
		});
	});

	describe("formatBox", () => {
		it("returns simple title: description join in production", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "box" });
			const out = logger.formatBox({
				title: "T",
				description: "D",
				lines: ["L1", "L2"],
			});
			expect(out).toBe("T: D\nL1\nL2");
		});

		it("truncates long lines when wrap is false", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			process.stdout.columns = 40;
			const logger = new Logger({ name: "box" });
			const long = "x".repeat(80);
			const out = stripAnsi(
				logger.formatBox({
					title: "Title",
					description: long,
					width: 10,
					maxWidthPct: 0.5,
					wrap: false,
					pad: 1,
				}),
			);
			expect(out).toContain("┌");
			expect(out).toContain("…");
			expect(out).not.toContain(long);
		});

		it("wraps on spaces when wrap is true and space is past 60% width", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			process.stdout.columns = 80;
			const logger = new Logger({ name: "box" });
			const out = stripAnsi(
				logger.formatBox({
					title: "Wrap Title",
					description: "alpha beta gamma delta epsilon zeta",
					width: 20,
					maxWidthPct: 0.4,
					wrap: true,
					pad: 1,
				}),
			);
			expect(out).toContain("┌");
			expect(out).toContain("alpha");
			expect(out).toContain("beta");
			expect(out.split("\n").length).toBeGreaterThan(5);
		});

		it("supports custom border characters and padding", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "box" });
			const out = stripAnsi(
				logger.formatBox({
					title: "Custom",
					description: "Body",
					borderChar: "=",
					pad: 2,
					width: 30,
				}),
			);
			expect(out).toContain("┌");
			expect(out).toContain("=".repeat(10));
			expect(out).toContain("Custom");
			expect(out).toContain("Body");
		});

		it("uses stdout columns fallback of 80 when columns is falsy", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			(process.stdout as { columns?: number }).columns = 0;
			const logger = new Logger({ name: "box" });
			const out = stripAnsi(
				logger.formatBox({
					title: "Cols",
					description: "ok",
					width: 60,
					maxWidthPct: 1,
				}),
			);
			expect(out).toContain("┌");
			expect(out).toContain("Cols");
		});

		it("forces boxed formatBox output in production with ADK_FORCE_BOXES", () => {
			process.env.NODE_ENV = "production";
			process.env.ADK_FORCE_BOXES = "true";
			const logger = new Logger({ name: "box" });
			const out = stripAnsi(
				logger.formatBox({
					title: "Forced",
					description: "still boxed",
				}),
			);
			expect(out).toContain("┌");
			expect(out).toContain("Forced");
		});
	});

	describe("warnStructured", () => {
		it("emits JSON payload when format is json", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "structured" });
			logger.warnStructured(
				{
					code: "W1",
					message: "json-warn",
					suggestion: "retry",
					context: { step: "build" },
					severity: "warn",
					timestamp: "2020-01-01T00:00:00.000Z",
				},
				{ format: "json" },
			);

			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain('"code":"W1"');
			expect(rendered).toContain('"message":"json-warn"');
			expect(rendered).toContain('"source":"structured"');
			expect(rendered).toContain('"timestamp":"2020-01-01T00:00:00.000Z"');
			expect(rendered).toContain('"level":"warn"');
		});

		it("emits text format with arrow suggestion and optional verbose context", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "structured" });
			logger.warnStructured(
				{
					code: "T1",
					message: "text-warn",
					suggestion: "do this",
					context: { n: 9 },
				},
				{ format: "text", verbose: true },
			);

			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("[T1] text-warn");
			expect(rendered).toContain("-> do this");
			expect(rendered).toContain("• Context: n=9");
		});

		it("omits context in text format when not verbose", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			delete process.env.ADK_AGENT_BUILDER_WARN;
			const logger = new Logger({ name: "structured" });
			logger.warnStructured(
				{
					code: "T2",
					message: "quiet-text",
					suggestion: "hint",
					context: { hidden: true },
				},
				{ format: "text" },
			);

			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("[T2] quiet-text");
			expect(rendered).toContain("-> hint");
			expect(rendered).not.toContain("hidden");
		});

		it("uses pretty format by default with suggestion lines", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			delete process.env.ADK_WARN_FORMAT;
			const logger = new Logger({ name: "structured" });
			logger.warnStructured({
				code: "P1",
				message: "pretty-warn",
				suggestion: "fix it",
			});

			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("P1");
			expect(rendered).toContain("pretty-warn");
			expect(rendered).toContain("• Suggestion: fix it");
		});

		it("honors ADK_WARN_FORMAT and ADK_AGENT_BUILDER_WARN=verbose", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			process.env.ADK_WARN_FORMAT = "text";
			process.env.ADK_AGENT_BUILDER_WARN = "verbose";
			const logger = new Logger({ name: "structured" });
			logger.warnStructured({
				code: "ENV1",
				message: "from-env",
				context: { via: "env" },
			});

			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("[ENV1] from-env");
			expect(rendered).toContain("• Context: via=env");
		});

		it("falls back to warn icon for unknown severity", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "structured" });
			logger.warnStructured(
				{
					code: "S1",
					message: "unknown-sev",
					severity: "not-a-level" as any,
				},
				{ format: "pretty" },
			);

			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("🚧");
			expect(rendered).toContain("S1");
			expect(rendered).toContain("unknown-sev");
		});

		it("includes verbose context in pretty format", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "structured" });
			logger.warnStructured(
				{
					code: "V1",
					message: "verbose-pretty",
					context: { k: "v" },
				},
				{ format: "pretty", verbose: true },
			);

			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("• Context: k=v");
		});
	});

	describe("debugStructured and debugArray", () => {
		it("no-ops when debug is disabled", () => {
			const logger = new Logger({ name: "dbg" });
			logger.isDebugEnabled = false;
			logger.debugStructured("title", { a: 1 });
			logger.debugArray("items", [{ id: 1 }]);
			expect(logSpy).not.toHaveBeenCalled();
		});

		it("renders empty object marker and truncates long values", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "dbg" });
			logger.isDebugEnabled = true;

			logger.debugStructured("empty-title", {});
			const emptyOut = stripAnsi(String(logSpy.mock.calls[0][0]));
			expect(emptyOut).toContain("Debug");
			expect(emptyOut).toContain("empty-title");
			expect(emptyOut).toContain("(empty)");

			logSpy.mockClear();
			const long = "z".repeat(200);
			logger.debugStructured("long-title", { value: long });
			const longOut = stripAnsi(String(logSpy.mock.calls[0][0]));
			expect(longOut).toContain("value");
			expect(longOut).toContain("…");
			expect(longOut).not.toContain(long);
		});

		it("pads keys by width and supports many entries", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "dbg" });
			logger.isDebugEnabled = true;
			const data: Record<string, number> = {};
			for (let i = 0; i < 5; i++) {
				data[`key${i}`] = i;
			}
			logger.debugStructured("keys", data);
			const out = stripAnsi(String(logSpy.mock.calls[0][0]));
			expect(out).toContain("key0");
			expect(out).toContain("key4");
			expect(out).toContain(": 0");
		});

		it("renders empty list marker and omits items beyond 50", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "dbg" });
			logger.isDebugEnabled = true;

			logger.debugArray("none", []);
			const emptyOut = stripAnsi(String(logSpy.mock.calls[0][0]));
			expect(emptyOut).toContain("Debug List");
			expect(emptyOut).toContain("(empty list)");

			logSpy.mockClear();
			const items = Array.from({ length: 55 }, (_, i) => ({
				id: i,
				label: `item-${i}`,
			}));
			logger.debugArray("many", items);
			const manyOut = stripAnsi(String(logSpy.mock.calls[0][0]));
			expect(manyOut).toContain("[1]");
			expect(manyOut).toContain("[50]");
			expect(manyOut).toContain("… 5 more items omitted");
			expect(manyOut).not.toContain("item-54");
		});

		it("truncates long property values inside debugArray rows", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "dbg" });
			logger.isDebugEnabled = true;
			logger.debugArray("row", [{ blob: "q".repeat(200) }]);
			const out = stripAnsi(String(logSpy.mock.calls[0][0]));
			expect(out).toContain("[1]");
			expect(out).toContain("blob=");
			expect(out).toContain("…");
		});
	});

	describe("leftover stack, meta, and structured edges", () => {
		it("omits stack section when ADK_ERROR_STACK_FRAMES is 0", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			process.env.ADK_ERROR_STACK_FRAMES = "0";
			const logger = new Logger({ name: "stack0" });
			const err = new Error("no-frames");
			err.stack = ["Error: no-frames", "    at only (file.ts:1:1)"].join("\n");

			logger.error("failed", err);
			const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
			expect(rendered).toContain("• Error: no-frames");
			expect(rendered).toContain("• Stack:");
			expect(rendered).toContain("↳ … 1 more frames");
			expect(rendered).not.toContain("only");
		});

		it("includes error message without stack when Error.stack is missing", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "nostack" });
			const err = new Error("bare");
			err.stack = undefined;

			logger.error("failed", err);
			const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
			expect(rendered).toContain("• Error: bare");
			expect(rendered).not.toContain("• Stack:");
		});

		it("uses custom Error subclass names in error lines", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "custom-err" });
			class BoomError extends Error {
				name = "BoomError";
			}
			logger.error("failed", new BoomError("kaboom"));
			const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
			expect(rendered).toContain("• BoomError: kaboom");
		});

		it("accepts suggestion-only and context-only meta objects", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "meta-split" });

			logger.warn("s-only", { suggestion: "try-a" });
			logger.warn("c-only", { context: { step: 2 } });

			const first = stripAnsi(String(warnSpy.mock.calls[0][0]));
			const second = stripAnsi(String(warnSpy.mock.calls[1][0]));
			expect(first).toContain("• Suggestion: try-a");
			expect(first).not.toContain("• Context:");
			expect(second).toContain("• Context: step=2");
			expect(second).not.toContain("• Suggestion:");
		});

		it("boxes warn meta lines outside production", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "boxed-meta" });
			logger.warn("watch", {
				suggestion: "retry",
				context: { id: "x" },
			});

			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("┌");
			expect(rendered).toContain("watch");
			expect(rendered).toContain("• Suggestion: retry");
			expect(rendered).toContain("• Context: id=x");
		});

		it("hard-wraps long tokens when wrap is true and no safe space exists", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			process.stdout.columns = 80;
			const logger = new Logger({ name: "hardwrap" });
			const token = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
			const out = stripAnsi(
				logger.formatBox({
					title: "Hard",
					description: token,
					width: 12,
					maxWidthPct: 0.3,
					wrap: true,
					pad: 1,
				}),
			);
			expect(out).toContain("┌");
			expect(out.split("\n").length).toBeGreaterThan(5);
			expect(out).toContain("abcd");
		});

		it("wraps additional lines as well as the description", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "wrap-lines" });
			const out = stripAnsi(
				logger.formatBox({
					title: "Lines",
					description: "short",
					lines: ["alpha beta gamma delta epsilon"],
					width: 18,
					maxWidthPct: 0.4,
					wrap: true,
					pad: 1,
				}),
			);
			expect(out).toContain("alpha");
			expect(out).toContain("beta");
		});

		it("warnStructured uses info and error icons for known severities", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "sev" });

			logger.warnStructured(
				{ code: "I1", message: "info-msg", severity: "info" },
				{ format: "pretty" },
			);
			logger.warnStructured(
				{ code: "E1", message: "error-msg", severity: "error" },
				{ format: "pretty" },
			);

			const infoOut = stripAnsi(String(warnSpy.mock.calls[0][0]));
			const errorOut = stripAnsi(String(warnSpy.mock.calls[1][0]));
			expect(infoOut).toContain("ℹ️");
			expect(infoOut).toContain("I1");
			expect(errorOut).toContain("❌");
			expect(errorOut).toContain("E1");
		});

		it("warnStructured json auto-fills timestamp when omitted", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "ts" });
			const before = Date.now();
			logger.warnStructured(
				{ code: "T0", message: "auto-ts" },
				{ format: "json" },
			);
			const after = Date.now();
			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			const jsonStart = rendered.indexOf("{");
			expect(jsonStart).toBeGreaterThanOrEqual(0);
			const payload = JSON.parse(rendered.slice(jsonStart));
			const parsed = Date.parse(payload.timestamp);
			expect(parsed).toBeGreaterThanOrEqual(before - 1000);
			expect(parsed).toBeLessThanOrEqual(after + 1000);
			expect(payload.code).toBe("T0");
			expect(payload.source).toBe("ts");
		});

		it("warnStructured pretty omits empty context even when verbose", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "empty-ctx" });
			logger.warnStructured(
				{
					code: "C0",
					message: "no-ctx",
					suggestion: "n/a",
					context: {},
				},
				{ format: "pretty", verbose: true },
			);
			const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
			expect(rendered).toContain("• Suggestion: n/a");
			expect(rendered).not.toContain("• Context:");
		});

		it("pads short keys to at least width 6 in debugStructured", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "pad" });
			logger.isDebugEnabled = true;
			logger.debugStructured("pad", { a: 1 });
			const out = stripAnsi(String(logSpy.mock.calls[0][0]));
			expect(out).toMatch(/a\s+: 1/);
		});

		it("caps key padding width at 30 for very long keys", () => {
			process.env.NODE_ENV = "development";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "wide" });
			logger.isDebugEnabled = true;
			const longKey = "k".repeat(40);
			logger.debugStructured("wide", { [longKey]: "v" });
			const out = stripAnsi(String(logSpy.mock.calls[0][0]));
			expect(out).toContain(longKey);
			expect(out).toContain(": v");
		});

		it("renders debugStructured with simple formatBox in production", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "prod-dbg" });
			logger.isDebugEnabled = true;
			logger.debugStructured("title", { a: 1 });
			const out = stripAnsi(String(logSpy.mock.calls[0][0]));
			expect(out).not.toContain("┌");
			expect(out).toContain("title");
			expect(out).toContain("a");
			expect(out).toContain(": 1");
		});

		it("skips blank stack frames when parsing error stacks", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			delete process.env.ADK_ERROR_STACK_FRAMES;
			const logger = new Logger({ name: "blank-frames" });
			const err = new Error("gap");
			err.stack = [
				"Error: gap",
				"",
				"    at keep (x.ts:1:1)",
				"   ",
				"    at also (y.ts:2:2)",
			].join("\n");
			logger.error("failed", err);
			const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
			expect(rendered).toContain("↳ keep (x.ts:1:1)");
			expect(rendered).toContain("↳ also (y.ts:2:2)");
		});

		it("treats ADK_DEBUG values other than true as disabled", async () => {
			process.env.NODE_ENV = "production";
			process.env.ADK_DEBUG = "false";
			vi.resetModules();
			({ isDebugEnabled } = await import("../../logger"));
			expect(isDebugEnabled()).toBe(false);
		});

		it("passes plain objects without suggestion/context through as args", () => {
			process.env.NODE_ENV = "production";
			delete process.env.ADK_FORCE_BOXES;
			const logger = new Logger({ name: "plain-arg" });
			logger.info("msg", { plain: true, nested: { z: 1 } });
			const rendered = stripAnsi(String(debugSpy.mock.calls[0][0]));
			expect(rendered).toContain('"plain":true');
			expect(rendered).not.toContain("• Suggestion:");
			expect(rendered).not.toContain("• Context:");
		});
	});
});
