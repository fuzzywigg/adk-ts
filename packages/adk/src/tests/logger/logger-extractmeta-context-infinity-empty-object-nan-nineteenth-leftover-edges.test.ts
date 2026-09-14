import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after #253):
 * `meta.context && Object.keys(meta.context).length` — eighteenth pinned
 * true/`1`/`[]`/`-0`/`"true"`/`[1]`. Residual: empty `{}` / NaN / ±Infinity
 * ToObject → empty keys omit; string `"1"` char-index `0=1`.
 */
describe("Logger extractMeta context infinity/empty-object/nan nineteenth leftover", () => {
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
		{ label: "empty object", context: {} },
		{ label: "NaN", context: Number.NaN },
		{ label: "Infinity", context: Number.POSITIVE_INFINITY },
		{ label: "-Infinity", context: Number.NEGATIVE_INFINITY },
	] as const)("context=$label → Object.keys empty → omit Context", ({
		context,
	}) => {
		const logger = new Logger({ name: "ctx-19h-omit" });
		logger.warn("m", { context: context as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("m");
		expect(rendered).not.toContain("• Context:");
	});

	it('context="1" → char-index Context entry 0=1', () => {
		const logger = new Logger({ name: "ctx-19h-str-one" });
		logger.warn("m", { context: "1" as any });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Context:");
		expect(rendered).toContain("0=1");
	});

	it("context={k:1} still stringifies peers-one via stringify", () => {
		const logger = new Logger({ name: "ctx-19h-obj-one" });
		logger.warn("m", { context: { k: 1 } });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Context:");
		expect(rendered).toContain("k=1");
	});
});
