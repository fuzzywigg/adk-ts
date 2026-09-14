import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Fifteenth leftover: long_running_tool_ids_json truthy string is parsed then
 * passed to `new Set(...)`. JSON "0"/"false"/"123" yield non-iterables →
 * throw; "null" parses to null → Set(null) empty; corrupt falls back to [].
 */
describe("database long-running json literal set fifteenth leftover", () => {
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

	function convert(long_running_tool_ids_json: string | null) {
		return (service as any).storageEventToEvent({
			id: "e1",
			app_name: "app",
			user_id: "u",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date("2024-01-01T00:00:00.000Z"),
			content: null,
			actions: null,
			long_running_tool_ids_json,
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
		});
	}

	it.each([
		"0",
		"false",
		"123",
	] as const)("long_running_tool_ids_json %j throws via new Set(non-iterable)", (json) => {
		expect(() => convert(json)).toThrow();
	});

	it('JSON "null" becomes empty Set (iterable nullish path)', () => {
		const event = convert("null");
		expect(event.longRunningToolIds).toEqual(new Set());
	});

	it("corrupt JSON falls back to [] then empty Set", () => {
		const event = convert("  {");
		expect(event.longRunningToolIds).toEqual(new Set());
	});

	it("JSON array still builds Set (control)", () => {
		const event = convert(JSON.stringify(["a", "b"]));
		expect(event.longRunningToolIds).toEqual(new Set(["a", "b"]));
	});
});
