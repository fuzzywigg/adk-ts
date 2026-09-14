import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Fourteenth leftover: storageEventToEvent uses `partial || undefined` etc.
 * Stored false becomes undefined on read; true is kept. isFinalResponse uses
 * `turnComplete === true` so false/undefined both fail the strict check.
 */
describe("database storageEvent false-to-undefined fourteenth leftover", () => {
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

	it("false boolean columns become undefined on storageEventToEvent", () => {
		const event = (service as any).storageEventToEvent({
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
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: false,
			turn_complete: false,
			error_code: null,
			error_message: null,
			interrupted: false,
		});
		expect(event.partial).toBeUndefined();
		expect(event.turnComplete).toBeUndefined();
		expect(event.interrupted).toBeUndefined();
		expect(event.isFinalResponse()).toBe(false);
	});

	it("true turn_complete stays true and isFinalResponse passes", () => {
		const event = (service as any).storageEventToEvent({
			id: "e2",
			app_name: "app",
			user_id: "u",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date("2024-01-01T00:00:00.000Z"),
			content: null,
			actions: null,
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: true,
			turn_complete: true,
			error_code: null,
			error_message: null,
			interrupted: true,
		});
		expect(event.partial).toBe(true);
		expect(event.turnComplete).toBe(true);
		expect(event.interrupted).toBe(true);
		expect(event.isFinalResponse()).toBe(true);
	});
});
