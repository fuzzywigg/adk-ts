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
});
