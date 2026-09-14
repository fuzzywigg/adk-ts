import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(input: string): string {
	const esc = String.fromCharCode(27);
	return input.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

describe("Logger seventh leftover — ADK_FORCE_BOXES === 'true' case asymmetry", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
	};
	const originalColumns = process.stdout.columns;

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
		process.stdout.columns = 120;
		process.env.NODE_ENV = "production";
		vi.spyOn(console, "log").mockImplementation(() => {});
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.resetModules();
		({ Logger } = await import("../../logger"));
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(originalEnv)) {
			restoreEnvKey(key, value);
		}
		process.stdout.columns = originalColumns;
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "TRUE", value: "TRUE" },
		{ label: "True", value: "True" },
		{ label: "1", value: "1" },
		{ label: "yes", value: "yes" },
		{ label: "empty", value: "" },
		{ label: "true ", value: "true " },
		{ label: " true", value: " true" },
	] as const)("prod warn stays simple when ADK_FORCE_BOXES=$label (strict === 'true')", ({
		value,
	}) => {
		process.env.ADK_FORCE_BOXES = value;
		const logger = new Logger({ name: "force-case" });
		logger.warn("boxed?");
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).not.toContain("┌");
		expect(rendered).toContain("boxed?");
	});

	it("prod warn boxes only when ADK_FORCE_BOXES is exact 'true'", () => {
		process.env.ADK_FORCE_BOXES = "true";
		const logger = new Logger({ name: "force-exact" });
		logger.warn("must-box");
		const rendered = stripAnsi(String(warnSpy.mock.calls[0][0]));
		expect(rendered).toContain("┌");
		expect(rendered).toContain("must-box");
	});

	it.each([
		{ label: "TRUE", value: "TRUE" },
		{ label: "1", value: "1" },
		{ label: "yes", value: "yes" },
	] as const)("formatBox stays simple in prod when ADK_FORCE_BOXES=$label", ({
		value,
	}) => {
		process.env.ADK_FORCE_BOXES = value;
		const logger = new Logger({ name: "box-fmt" });
		const out = stripAnsi(
			logger.formatBox({
				title: "T",
				description: "d",
			}),
		);
		expect(out).not.toContain("┌");
		expect(out).toContain("T: d");
	});
});
