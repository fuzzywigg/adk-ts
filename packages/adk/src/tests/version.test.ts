import { describe, expect, it } from "vitest";
import { VERSION } from "../version";

describe("VERSION", () => {
	it("exports a non-empty semver-like string", () => {
		expect(typeof VERSION).toBe("string");
		expect(VERSION.length).toBeGreaterThan(0);
		expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
	});

	it("exports the exact VERSION constant", () => {
		expect(VERSION).toBe("0.1.0");
	});
});
