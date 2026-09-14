import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Eighteenth leftover residual deepen (complements open #253):
 * #253 pinned formatArgs/extractMeta !arg and context Object.keys.
 * Residual: objectToLines `obj || {}` for true/"true"/[]/-0/±Infinity;
 * stringify of property values true/"true"/[]/-0/Infinity via arrayToLines.
 */
describe("Logger object/array lines true/string-true/negzero eighteenth leftover", () => {
	const originalEnv: Record<string, string | undefined> = {
		NODE_ENV: process.env.NODE_ENV,
		ADK_DEBUG: process.env.ADK_DEBUG,
		ADK_FORCE_BOXES: process.env.ADK_FORCE_BOXES,
	};

	let Logger: typeof import("../../logger").Logger;

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
		process.env.NODE_ENV = "development";
		process.env.ADK_DEBUG = "true";
		delete process.env.ADK_FORCE_BOXES;
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
		{ label: "-0", data: -0 },
		{ label: "boolean true", data: true },
		{ label: "empty array", data: [] },
		{ label: "Infinity", data: Number.POSITIVE_INFINITY },
		{ label: "-Infinity", data: Number.NEGATIVE_INFINITY },
	] as const)("objectToLines $label → empty entries → (empty)", ({ data }) => {
		const logger = new Logger({ name: "obj-empty" });
		expect((logger as any).objectToLines(data)).toEqual(["(empty)"]);
	});

	it('objectToLines "true" → char-index entries (0:t … 3:e)', () => {
		const logger = new Logger({ name: "obj-str-true" });
		const lines = (logger as any).objectToLines("true");
		expect(lines).toHaveLength(4);
		expect(lines[0]).toMatch(/^0\s+: t$/);
		expect(lines[1]).toMatch(/^1\s+: r$/);
		expect(lines[2]).toMatch(/^2\s+: u$/);
		expect(lines[3]).toMatch(/^3\s+: e$/);
	});

	it('objectToLines stringifies value true / "true" / [] / Infinity / -0', () => {
		const logger = new Logger({ name: "obj-vals" });
		const lines = (logger as any).objectToLines({
			a: true,
			b: "true",
			c: [],
			d: Number.POSITIVE_INFINITY,
			e: -0,
		});
		expect(lines.find((l: string) => l.startsWith("a"))).toContain(": true");
		expect(lines.find((l: string) => l.startsWith("b"))).toContain(": true");
		expect(lines.find((l: string) => l.startsWith("c"))).toContain(": []");
		expect(lines.find((l: string) => l.startsWith("d"))).toContain(
			": Infinity",
		);
		expect(lines.find((l: string) => l.startsWith("e"))).toContain(": 0");
	});

	it('arrayToLines stringifies residual true / "true" / [] / Infinity / -0 props', () => {
		const logger = new Logger({ name: "arr-vals" });
		const lines = (logger as any).arrayToLines([
			{
				a: true,
				b: "true",
				c: [],
				d: Number.NEGATIVE_INFINITY,
				e: -0,
			},
		]);
		expect(lines[0]).toContain("a=true");
		expect(lines[0]).toContain("b=true");
		expect(lines[0]).toContain("c=[]");
		expect(lines[0]).toContain("d=-Infinity");
		expect(lines[0]).toContain("e=0");
	});
});
