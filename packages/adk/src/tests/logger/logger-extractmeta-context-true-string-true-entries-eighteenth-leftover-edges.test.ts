import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Eighteenth leftover (HEAVY tip-relaunch residual after #227):
 * `meta.context && Object.keys(meta.context).length` — boolean `true` /
 * number `1` coerce via ToObject to empty keys → omit Context; truthy string
 * `"true"` becomes char-index entries; `[]` length 0 omits; `[1]` emits `0=1`.
 * Sibling of telemetry Object.entries config eighteenth residual.
 */
describe("Logger extractMeta context true/string-true entries eighteenth leftover", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
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
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "debug").mockImplementation(() => {});
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
	] as const)("context=$label → Object.keys empty/falsy → omit Context", ({
		context,
	}) => {
		const logger = new Logger({ name: "ctx-omit" });
		logger.warn("m", { context: context as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("m");
		expect(rendered).not.toContain("• Context:");
	});

	it('context="true" → char-index Context entries (0=t 1=r 2=u 3=e)', () => {
		const logger = new Logger({ name: "ctx-str-true" });
		logger.warn("m", { context: "true" as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Context:");
		expect(rendered).toContain("0=t");
		expect(rendered).toContain("1=r");
		expect(rendered).toContain("2=u");
		expect(rendered).toContain("3=e");
	});

	it("context=[1] → Object.keys length 1 emits 0=1", () => {
		const logger = new Logger({ name: "ctx-arr-one" });
		logger.warn("m", { context: [1] as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Context:");
		expect(rendered).toContain("0=1");
	});

	it("context={k:true} still stringifies boolean true via stringify", () => {
		const logger = new Logger({ name: "ctx-obj-true" });
		logger.warn("m", { context: { k: true } });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Context:");
		expect(rendered).toContain("k=true");
	});
});
