import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Eighteenth leftover (logger/env residual HEAVY): formatArgs `!arg` skip for
 * SameValueZero `-0` vs keep for boolean `true` / `[]` / `NEGATIVE_INFINITY`;
 * warnStructured `opts.verbose ||` keeps `[]` / `"true"` (truthy) while `-0`
 * skips Context.
 */
describe("Logger formatArgs/verbose negzero/true/emptyarray eighteenth leftover", () => {
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

	it("formatArgs skips -0 via !arg (SameValueZero falsy)", () => {
		const logger = new Logger({ name: "args-negzero" });
		logger.warn("msg", -0 as any);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("msg");
		expect(rendered).not.toContain("• 0");
		expect(rendered).not.toContain("• -0");
	});

	it.each([
		{ label: "boolean true", value: true, needle: "• true" },
		{ label: "empty array", value: [], needle: "• []" },
		{
			label: "NEGATIVE_INFINITY",
			value: Number.NEGATIVE_INFINITY,
			needle: "• -Infinity",
		},
	])("formatArgs keeps $label via stringify", ({ value, needle }) => {
		const logger = new Logger({ name: "args-keep" });
		logger.warn("msg", value as any);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain(needle);
	});

	it("verbose=-0 skips Context even when context has keys", () => {
		const logger = new Logger({ name: "verb-negzero" });
		logger.warnStructured(
			{
				code: "VNZ",
				message: "quiet",
				context: { a: 1 },
			},
			{ format: "pretty", verbose: -0 as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("🚧 VNZ quiet");
		expect(rendered).not.toContain("Context:");
	});

	it.each([
		{ label: "empty array", value: [] },
		{ label: 'string "true"', value: "true" },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("verbose=$label keeps Context line (truthy near-miss)", ({ value }) => {
		const logger = new Logger({ name: "verb-keep" });
		logger.warnStructured(
			{
				code: "VK",
				message: "shown",
				context: { k: "v" },
			},
			{ format: "pretty", verbose: value as any },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Context: k=v");
	});
});
