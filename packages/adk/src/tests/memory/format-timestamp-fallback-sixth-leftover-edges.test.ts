import { describe, expect, it } from "vitest";
import { formatTimestamp } from "../../memory/_utils";

/**
 * Leftover deepen: formatTimestamp only special-cases Date / string / number.
 * Other types (bigint, symbol, array, function, boolean false) fall through to
 * `new Date().toISOString()`. Empty string is preserved as string arm.
 */
describe("formatTimestamp sixth leftover: non-primitive fallback matrix", () => {
	const fallbackInputs: Array<{ label: string; value: any }> = [
		{ label: "plain-object", value: {} },
		{ label: "array", value: [] },
		{ label: "true", value: true },
		{ label: "false", value: false },
		{ label: "bigint", value: 1n },
		{ label: "function", value: () => 1 },
		{ label: "symbol", value: Symbol("ts") },
	];

	for (const { label, value } of fallbackInputs) {
		it(`falls back to near-now ISO for ${label}`, () => {
			const before = Date.now();
			const formatted = formatTimestamp(value);
			const after = Date.now();
			const parsed = Date.parse(formatted);
			expect(Number.isNaN(parsed)).toBe(false);
			expect(parsed).toBeGreaterThanOrEqual(before - 1);
			expect(parsed).toBeLessThanOrEqual(after + 20);
		});
	}

	it("empty string stays empty via string arm (not fallback)", () => {
		expect(formatTimestamp("")).toBe("");
	});

	it("whitespace string passes through unchanged", () => {
		expect(formatTimestamp("  ")).toBe("  ");
		expect(formatTimestamp("not-a-date")).toBe("not-a-date");
	});

	it("Number.POSITIVE_INFINITY throws RangeError on toISOString", () => {
		expect(() => formatTimestamp(Number.POSITIVE_INFINITY)).toThrow(RangeError);
	});

	it("Number.NEGATIVE_INFINITY throws RangeError on toISOString", () => {
		expect(() => formatTimestamp(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
	});

	it("Date subclass still hits instanceof Date arm", () => {
		class SubDate extends Date {}
		const d = new SubDate("2020-01-01T00:00:00.000Z");
		expect(formatTimestamp(d)).toBe("2020-01-01T00:00:00.000Z");
	});
});
