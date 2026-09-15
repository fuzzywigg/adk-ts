import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Nineteenth leftover residual after tip #261 / #253:
 * #253 extractMeta pinned warn() context true/"true"/[]/-0 Object.keys.
 * Residual: warnStructured's own `warning.context && Object.keys` on pretty
 * and text paths (duplicate gate, not extractMeta).
 */
describe("Logger warnStructured context true/string-true entries nineteenth leftover", () => {
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
		{ label: "boolean true", context: true },
		{ label: "number 1", context: 1 },
		{ label: "empty array", context: [] },
		{ label: "-0", context: -0 },
	] as const)("pretty verbose context=$label → Object.keys empty → omit Context", ({
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

	it('pretty verbose context="true" → char-index Context (0=t … 3=e)', () => {
		const logger = new Logger({ name: "ws-ctx-str" });
		logger.warnStructured(
			{ code: "C", message: "m", context: "true" as any },
			{ format: "pretty", verbose: true },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Context:");
		expect(rendered).toContain("0=t");
		expect(rendered).toContain("3=e");
	});

	it("pretty verbose context=[1] → emits 0=1", () => {
		const logger = new Logger({ name: "ws-ctx-one" });
		logger.warnStructured(
			{ code: "C", message: "m", context: [1] as any },
			{ format: "pretty", verbose: true },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Context:");
		expect(rendered).toContain("0=1");
	});

	it.each([
		{ label: "boolean true", context: true },
		{ label: "empty array", context: [] },
		{ label: "-0", context: -0 },
	] as const)("text verbose context=$label omits Context", ({ context }) => {
		const logger = new Logger({ name: "ws-txt-omit" });
		logger.warnStructured(
			{ code: "T", message: "m", context: context as any },
			{ format: "text", verbose: true },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("[T] m");
		expect(rendered).not.toContain("Context:");
	});

	it('text verbose context="true" → char-index Context', () => {
		const logger = new Logger({ name: "ws-txt-str" });
		logger.warnStructured(
			{ code: "T", message: "m", context: "true" as any },
			{ format: "text", verbose: true },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("Context:");
		expect(rendered).toContain("0=t");
		expect(rendered).toContain("2=u");
	});
});
