import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Fifteenth leftover: parseJsonSafely `if (!jsonString)` — whitespace is
 * truthy so JSON.parse runs and throws → defaultValue. Distinct from ""
 * which short-circuits via !jsonString (fourth leftover).
 */
describe("database parsejson whitespace truthy fifteenth leftover", () => {
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
		{ label: "space", input: " " },
		{ label: "tab", input: "\t" },
		{ label: "newline", input: "\n" },
		{ label: "mixed", input: " \t\n " },
	] as const)("whitespace $label is truthy then parse-fails to default", ({
		input,
	}) => {
		const parse = (service as any).parseJsonSafely.bind(service);
		expect(parse(input, { fb: 1 })).toEqual({ fb: 1 });
	});

	it("empty string still short-circuits via !jsonString (control)", () => {
		const parse = (service as any).parseJsonSafely.bind(service);
		expect(parse("", { fb: 1 })).toEqual({ fb: 1 });
	});

	it('JSON "0" still parses to number 0 (control)', () => {
		const parse = (service as any).parseJsonSafely.bind(service);
		expect(parse("0", 99)).toBe(0);
	});
});
