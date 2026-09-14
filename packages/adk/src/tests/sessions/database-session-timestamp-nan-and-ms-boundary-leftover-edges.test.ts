import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Leftover: invalid date string → NaN (no fallback-to-now);
 * exact 10_000_000_000 boundary uses > not >=; NaN number returns NaN.
 */
describe("database-session timestamp NaN and ms-boundary leftover edges", () => {
	let service: DatabaseSessionService;

	beforeEach(async () => {
		const Database = require("better-sqlite3");
		const { Kysely, SqliteDialect } = await import("kysely");
		const db = new Kysely({
			dialect: new SqliteDialect({
				database: new Database(":memory:"),
			}),
		});
		service = new DatabaseSessionService({ db });
	});

	it.each([
		"not-a-date",
		"",
		" ",
		"2020-99-99",
		"totally-invalid",
	])("invalid date string %j yields NaN (no fallback)", (input) => {
		const toUnix = (service as any).timestampToUnixSeconds.bind(service);
		expect(Number.isNaN(toUnix(input))).toBe(true);
	});

	it("exact 10_000_000_000 stays seconds (boundary is > not >=)", () => {
		const toUnix = (service as any).timestampToUnixSeconds.bind(service);
		expect(toUnix(10_000_000_000)).toBe(10_000_000_000);
	});

	it("10_000_000_001 divides as milliseconds", () => {
		const toUnix = (service as any).timestampToUnixSeconds.bind(service);
		expect(toUnix(10_000_000_001)).toBeCloseTo(10_000_000_001 / 1000);
	});

	it("NaN number input returns NaN (number branch, not fallback)", () => {
		const toUnix = (service as any).timestampToUnixSeconds.bind(service);
		expect(Number.isNaN(toUnix(Number.NaN))).toBe(true);
	});

	it.each([
		{
			label: "Infinity",
			value: Number.POSITIVE_INFINITY,
			expected: Number.POSITIVE_INFINITY,
		},
		{
			label: "-Infinity",
			value: Number.NEGATIVE_INFINITY,
			expected: Number.NEGATIVE_INFINITY,
		},
		{ label: "0", value: 0, expected: 0 },
		{ label: "-1", value: -1, expected: -1 },
	])("number $label passes through seconds path", ({ value, expected }) => {
		const toUnix = (service as any).timestampToUnixSeconds.bind(service);
		expect(toUnix(value)).toBe(expected);
	});

	it("valid ISO string still parses (control)", () => {
		const toUnix = (service as any).timestampToUnixSeconds.bind(service);
		expect(toUnix("2021-01-01T00:00:00.000Z")).toBe(
			Date.parse("2021-01-01T00:00:00.000Z") / 1000,
		);
	});

	it("non-date object still falls back to now", () => {
		const toUnix = (service as any).timestampToUnixSeconds.bind(service);
		const before = Date.now() / 1000;
		const got = toUnix({ weird: true });
		const after = Date.now() / 1000;
		expect(got).toBeGreaterThanOrEqual(before - 1);
		expect(got).toBeLessThanOrEqual(after + 1);
	});
});
