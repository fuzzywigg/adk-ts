import { describe, expect, it } from "vitest";
import { VERSION } from "../version";

describe("VERSION heavy matrix", () => {
	it("exports a string", () => {
		expect(typeof VERSION).toBe("string");
	});

	it("is non-empty", () => {
		expect(VERSION.length).toBeGreaterThan(0);
	});

	it("matches major.minor.patch prefix", () => {
		expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
	});

	it("uses dotted numeric segments", () => {
		const parts = VERSION.split(".");
		expect(parts.length).toBeGreaterThanOrEqual(3);
		expect(parts[0]).toMatch(/^\d+$/);
		expect(parts[1]).toMatch(/^\d+$/);
		expect(parts[2]).toMatch(/^\d+/);
	});

	it("does not contain whitespace", () => {
		expect(VERSION).not.toMatch(/\s/);
	});

	it("is stable across repeated reads", () => {
		expect(VERSION).toBe(VERSION);
		expect(VERSION).toBe("0.1.0");
	});

	it("has a reasonable maximum length", () => {
		expect(VERSION.length).toBeLessThan(64);
	});

	it("does not start with v prefix", () => {
		expect(VERSION.startsWith("v")).toBe(false);
	});

	it("parses as comparable semver-like numbers", () => {
		const [major, minor, patch] = VERSION.split(".").map((p) =>
			Number.parseInt(p, 10),
		);
		expect(Number.isFinite(major)).toBe(true);
		expect(Number.isFinite(minor)).toBe(true);
		expect(Number.isFinite(patch)).toBe(true);
		expect(major).toBeGreaterThanOrEqual(0);
		expect(minor).toBeGreaterThanOrEqual(0);
		expect(patch).toBeGreaterThanOrEqual(0);
	});

	it("equals the package version constant shape used elsewhere", () => {
		expect(VERSION).toEqual(expect.stringMatching(/^\d+\.\d+\.\d+$/));
	});
});
