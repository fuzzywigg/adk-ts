import { describe, expect, it } from "vitest";
import { formatTimestamp } from "../../memory/_utils";

describe("formatTimestamp", () => {
	it("formats Date instances as ISO strings", () => {
		const date = new Date("2024-01-15T12:00:00.000Z");
		expect(formatTimestamp(date)).toBe("2024-01-15T12:00:00.000Z");
	});

	it("passes string timestamps through unchanged", () => {
		expect(formatTimestamp("already-iso")).toBe("already-iso");
	});

	it("formats numeric epoch milliseconds as ISO strings", () => {
		const ms = Date.parse("2024-06-01T00:00:00.000Z");
		expect(formatTimestamp(ms)).toBe("2024-06-01T00:00:00.000Z");
	});

	it("falls back to current ISO for unsupported types", () => {
		const before = Date.now();
		const formatted = formatTimestamp({} as any);
		const after = Date.now();
		const parsed = Date.parse(formatted);
		expect(parsed).toBeGreaterThanOrEqual(before);
		expect(parsed).toBeLessThanOrEqual(after + 5);
	});

	it("formats epoch 0 as the Unix epoch ISO string", () => {
		expect(formatTimestamp(0)).toBe(new Date(0).toISOString());
	});

	it("formats negative epoch milliseconds", () => {
		expect(formatTimestamp(-1000)).toBe(new Date(-1000).toISOString());
	});

	it("NaN numbers throw RangeError from Date.toISOString", () => {
		expect(() => formatTimestamp(Number.NaN)).toThrow(RangeError);
	});

	it("passes through empty strings unchanged", () => {
		expect(formatTimestamp("")).toBe("");
	});

	it("formats Date at a known UTC instant", () => {
		expect(formatTimestamp(new Date(Date.UTC(1970, 0, 1)))).toBe(
			"1970-01-01T00:00:00.000Z",
		);
	});
});
