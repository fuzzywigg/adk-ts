import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Twentieth leftover residual deepen after tip #289 / #292:
 * nineteenth pinned warnStructured context true/`"true"`/`[]`/`-0`/`1`.
 * Residual: `Object(true)` / `Object(1)` / `Object(false)` → empty keys omit;
 * `"Infinity"` → char-index Context (pretty + text).
 */
describe("Logger warnStructured context object-true/one/false/infinity twentieth leftover", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
		ADK_WARN_FORMAT: process.env.ADK_WARN_FORMAT,
		ADK_AGENT_BUILDER_WARN: process.env.ADK_AGENT_BUILDER_WARN,
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
		delete process.env.ADK_WARN_FORMAT;
		delete process.env.ADK_AGENT_BUILDER_WARN;
		vi.spyOn(console, "log").mockImplementation(() => {});
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
	])("pretty verbose context=$label → Object.keys empty → omit", ({
		context,
	}) => {
		const logger = new Logger({ name: "ws-ctx-omit" });
		logger.warnStructured(
			{ code: "C", message: "m", context: context as any },
			{ format: "pretty", verbose: true },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("C m");
		expect(rendered).not.toContain("Context:");
	});

	it('pretty verbose context="Infinity" → char-index Context', () => {
		const logger = new Logger({ name: "ws-ctx-inf" });
		logger.warnStructured(
			{ code: "C", message: "m", context: "Infinity" as any },
			{ format: "pretty", verbose: true },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Context:");
		expect(rendered).toContain("0=I");
		expect(rendered).toContain("7=y");
	});

	it.each([
		{ label: "Object(true)", context: Object(true) },
		{ label: "Object(false)", context: Object(false) },
	])("text verbose context=$label omits Context", ({ context }) => {
		const logger = new Logger({ name: "ws-txt-omit" });
		logger.warnStructured(
			{ code: "T", message: "m", context: context as any },
			{ format: "text", verbose: true },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[T] m");
		expect(rendered).not.toContain("Context:");
	});

	it('text verbose context="Infinity" → char-index Context', () => {
		const logger = new Logger({ name: "ws-txt-inf" });
		logger.warnStructured(
			{ code: "T", message: "m", context: "Infinity" as any },
			{ format: "text", verbose: true },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Context:");
		expect(rendered).toContain("0=I");
		expect(rendered).toContain("3=i");
	});
});
