import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after #253):
 * formatArgs/extractMeta `!arg` — eighteenth kept true/`"true"`/`[]`/
 * ±Infinity and skipped `-0`. Residual: empty `{}` / peers `1` kept;
 * NaN still skipped (fifteenth twin, re-asserted beside empty-object keep).
 */
describe("Logger formatArgs empty-object/peers-one/nan nineteenth leftover", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
	};

	let Logger: typeof import("../../logger").Logger;
	let debugSpy: ReturnType<typeof vi.spyOn>;
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
		debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
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
		{ label: "empty object", value: {}, needle: "• {}" },
		{ label: "peers 1", value: 1, needle: "• 1" },
	] as const)("info keeps truthy residual arg $label via !arg", ({
		value,
		needle,
	}) => {
		const logger = new Logger({ name: "fmt-19h-keep" });
		logger.info("m", value as any, { x: 1 });
		const rendered = stripAnsi(String(debugSpy.mock.calls[0][0]));
		expect(rendered).toContain(needle);
		expect(rendered).toContain('"x":1');
	});

	it("info skips NaN via !arg (fifteenth twin beside empty-object keep)", () => {
		const logger = new Logger({ name: "fmt-19h-nan" });
		logger.info("m", Number.NaN, { x: 1 });
		const rendered = stripAnsi(String(debugSpy.mock.calls[0][0]));
		expect(rendered).toContain('"x":1');
		expect(rendered).not.toContain("• NaN");
	});

	it.each([
		{ label: "empty object", suggestion: {}, needle: "[object Object]" },
		{ label: "peers 1", suggestion: 1, needle: "1" },
		{
			label: "Infinity",
			suggestion: Number.POSITIVE_INFINITY,
			needle: "Infinity",
		},
	] as const)("extractMeta keeps suggestion=$label (truthy residual)", ({
		suggestion,
		needle,
	}) => {
		const logger = new Logger({ name: "meta-19h-sug" });
		logger.warn("hinted", { suggestion: suggestion as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Suggestion:");
		expect(rendered).toContain(needle);
	});

	it("extractMeta skips suggestion=NaN via if (meta.suggestion)", () => {
		const logger = new Logger({ name: "meta-19h-nan-sug" });
		logger.warn("hinted", { suggestion: Number.NaN as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).not.toContain("• Suggestion:");
	});
});
