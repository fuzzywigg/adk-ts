import { describe, expect, it } from "vitest";
import { formatTimestamp } from "../../memory/_utils";

describe("formatTimestamp edges", () => {
	it("formats Date instances as ISO strings", () => {
		const date = new Date("2024-01-15T12:00:00.000Z");
		expect(formatTimestamp(date)).toBe("2024-01-15T12:00:00.000Z");
	});

	it("passes string timestamps through unchanged", () => {
		expect(formatTimestamp("already-iso")).toBe("already-iso");
		expect(formatTimestamp("")).toBe("");
	});

	it("formats numeric epoch milliseconds as ISO strings", () => {
		const ms = Date.parse("2024-06-01T00:00:00.000Z");
		expect(formatTimestamp(ms)).toBe("2024-06-01T00:00:00.000Z");
	});

	it("formats epoch zero as Unix epoch ISO", () => {
		expect(formatTimestamp(0)).toBe("1970-01-01T00:00:00.000Z");
	});

	it("formats negative epoch milliseconds", () => {
		expect(formatTimestamp(-1)).toBe("1969-12-31T23:59:59.999Z");
	});

	it("falls back to current ISO for unsupported types", () => {
		const before = Date.now();
		const formatted = formatTimestamp({} as any);
		const after = Date.now();
		const parsed = Date.parse(formatted);
		expect(parsed).toBeGreaterThanOrEqual(before);
		expect(parsed).toBeLessThanOrEqual(after + 5);
	});

	it("falls back to current ISO for null and undefined", () => {
		const before = Date.now();
		const fromNull = formatTimestamp(null as any);
		const fromUndefined = formatTimestamp(undefined as any);
		const after = Date.now();
		for (const formatted of [fromNull, fromUndefined]) {
			const parsed = Date.parse(formatted);
			expect(parsed).toBeGreaterThanOrEqual(before);
			expect(parsed).toBeLessThanOrEqual(after + 5);
		}
	});

	it("throws RangeError for NaN numeric timestamps", () => {
		expect(() => formatTimestamp(Number.NaN)).toThrow(RangeError);
	});

	it("throws RangeError for Invalid Date instances", () => {
		expect(() => formatTimestamp(new Date(Number.NaN))).toThrow(RangeError);
	});

	it("falls back for boolean inputs", () => {
		const before = Date.now();
		const formatted = formatTimestamp(true as any);
		const after = Date.now();
		const parsed = Date.parse(formatted);
		expect(parsed).toBeGreaterThanOrEqual(before);
		expect(parsed).toBeLessThanOrEqual(after + 5);
	});
});
