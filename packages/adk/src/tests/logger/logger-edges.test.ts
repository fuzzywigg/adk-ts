import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stripAnsi(value: string): string {
	const esc = String.fromCharCode(27);
	return value.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
}

describe("Logger leftover edges (TOKENMAXX post #124)", () => {
	let Logger: typeof import("../../logger").Logger;
	let logSpy: ReturnType<typeof vi.spyOn>;
	const originalEnv = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_DEBUG: process.env.ADK_DEBUG,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
	};

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
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.resetModules();
		({ Logger } = await import("../../logger"));
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(originalEnv)) {
			restoreEnvKey(key, value);
		}
		vi.restoreAllMocks();
	});

	it("debugStructured treats nullish data as empty via obj || {}", () => {
		process.env.NODE_ENV = "development";
		delete process.env.ADK_FORCE_BOXES;
		const logger = new Logger({ name: "null-data" });
		logger.isDebugEnabled = true;

		logger.debugStructured("title", null as any);
		const out = stripAnsi(String(logSpy.mock.calls[0][0]));
		expect(out).toContain("(empty)");

		logSpy.mockClear();
		logger.debugStructured("title2", undefined as any);
		const out2 = stripAnsi(String(logSpy.mock.calls[0][0]));
		expect(out2).toContain("(empty)");
	});

	it("objectToLines silently drops keys beyond the 200-entry cap", () => {
		process.env.NODE_ENV = "development";
		delete process.env.ADK_FORCE_BOXES;
		const logger = new Logger({ name: "many-keys" });
		logger.isDebugEnabled = true;

		const data: Record<string, number> = {};
		for (let i = 0; i < 201; i++) {
			data[`k${i}`] = i;
		}
		logger.debugStructured("caps", data);
		const out = stripAnsi(String(logSpy.mock.calls[0][0]));
		expect(out).toContain("k0");
		expect(out).toContain("k199");
		expect(out).not.toContain("k200");
	});
});
