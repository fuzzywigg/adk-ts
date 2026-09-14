import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Fifteenth leftover: parseJsonSafely — whitespace-only strings are truthy so
 * skip `!jsonString`, then JSON.parse throws → defaultValue.
 */
describe("database parseJson whitespace default fifteenth leftover", () => {
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
		" ",
		"\t",
		"\n",
		"  \n\t  ",
	] as const)("whitespace %j falls through to defaultValue", (jsonString) => {
		expect((service as any).parseJsonSafely(jsonString, { fb: 1 })).toEqual({
			fb: 1,
		});
	});

	it('string "0" parses to number 0 (control truthy JSON)', () => {
		expect((service as any).parseJsonSafely("0", { fb: 1 })).toBe(0);
	});

	it("empty string still early-returns default (control)", () => {
		expect((service as any).parseJsonSafely("", { fb: 1 })).toEqual({
			fb: 1,
		});
	});
});
