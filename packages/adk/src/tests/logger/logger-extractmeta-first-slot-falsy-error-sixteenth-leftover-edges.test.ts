import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

/**
 * Sixteenth leftover: extractMeta sets metaFound on the first object with
 * suggestion/context keys even when values are falsy, so a richer second meta
 * is demoted to otherArgs. Error instances with own suggestion/context stay
 * Error args (instanceof gate), not meta.
 */
describe("Logger extractMeta first-slot falsy / Error sixteenth leftover", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
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

	beforeEach(async () => {
		for (const [key, value] of Object.entries(originalEnv)) {
			restoreEnvKey(key, value);
		}
		process.env.NODE_ENV = "production";
		delete process.env.ADK_FORCE_BOXES;
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "debug").mockImplementation(() => {});
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

	it("falsy-first meta still consumes metaFound; richer second meta becomes arg JSON", () => {
		const logger = new Logger({ name: "meta-slot" });
		logger.warn(
			"slot",
			{ suggestion: "" },
			{ suggestion: "second", context: { b: 2 } },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("slot");
		expect(rendered).not.toContain("• Suggestion:");
		expect(rendered).not.toContain("• Context:");
		expect(rendered).toContain('"suggestion":"second"');
		expect(rendered).toContain('"b":2');
		expect(rendered).not.toContain("• Suggestion: second");
	});

	it("empty context on first meta still consumes slot (blocks later Context)", () => {
		const logger = new Logger({ name: "meta-empty-ctx" });
		logger.warn(
			"ctx",
			{ context: {} },
			{ suggestion: "later", context: { k: 9 } },
		);
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).not.toContain("• Suggestion:");
		expect(rendered).not.toContain("• Context:");
		expect(rendered).toContain('"suggestion":"later"');
		expect(rendered).toContain('"k":9');
	});

	it("Error with own suggestion/context is not meta; later plain meta still wins", () => {
		const logger = new Logger({ name: "err-meta" });
		const err = new Error("boom");
		(err as any).suggestion = "from-err";
		(err as any).context = { from: "error" };
		logger.warn("e", err, { suggestion: "from-meta" });
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Error: boom");
		expect(rendered).toContain("• Suggestion: from-meta");
		expect(rendered).not.toContain("• Suggestion: from-err");
		expect(rendered).not.toContain("from=error");
	});

	it("error level still formats Error-with-meta-keys as Error (not Suggestion)", () => {
		const logger = new Logger({ name: "err-level" });
		const err = new Error("fail");
		(err as any).suggestion = "ignore-me";
		logger.error("failed", err);
		const rendered = stripAnsi(String(errorSpy.mock.calls[0][0]));
		expect(rendered).toContain("• Error: fail");
		expect(rendered).not.toContain("• Suggestion:");
	});
});
