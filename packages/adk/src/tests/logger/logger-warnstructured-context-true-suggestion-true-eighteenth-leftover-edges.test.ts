import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Eighteenth leftover (logger/env residual): warnStructured / extractMeta boolean `true` for
 * suggestion (truthy keep → "true") vs context (truthy but Object.keys(true)
 * is [] so Context omitted). Distinct from fifteenth string `"0"`/`"false"`
 * and seventh falsy omit.
 */
describe("Logger warnStructured context/suggestion boolean-true eighteenth leftover", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
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
		{
			label: "pretty",
			format: "pretty" as const,
			needle: "• Suggestion: true",
		},
		{ label: "text", format: "text" as const, needle: "-> true" },
	])("suggestion=true kept as string true in $label", ({ format, needle }) => {
		const logger = new Logger({ name: "sug-bool" });
		logger.warnStructured(
			{
				code: "S",
				message: "hinted",
				suggestion: true as any,
			},
			{ format },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain(needle);
	});

	it("context=true + verbose omits Context (Object.keys(true) length 0)", () => {
		const logger = new Logger({ name: "ctx-bool" });
		logger.warnStructured(
			{
				code: "CX",
				message: "no-keys",
				context: true as any,
			},
			{ format: "pretty", verbose: true },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("🚧 CX no-keys");
		expect(rendered).not.toContain("Context:");
	});

	it("warn extractMeta context=true omits Context line (keys length 0)", () => {
		const logger = new Logger({ name: "meta-ctx-bool" });
		logger.warn("m", { context: true as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("m");
		expect(rendered).not.toContain("• Context:");
	});

	it("warn extractMeta suggestion=true keeps Suggestion: true", () => {
		const logger = new Logger({ name: "meta-sug-bool" });
		logger.warn("m", { suggestion: true as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Suggestion: true");
	});
});
