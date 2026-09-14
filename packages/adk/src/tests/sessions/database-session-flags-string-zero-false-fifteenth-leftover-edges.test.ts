import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Fifteenth leftover: eventToStorageEvent `flag || null` and storageEventToEvent
 * `flag || undefined` — eleventh/fourteenth pin falsy false/0→null/undefined and
 * truthy `"true"`/`"1"`. String `"0"` / `"false"` are kept (asymmetry vs numeric
 * 0 / boolean false).
 */
describe("database-session flags string-zero-false or-keep fifteenth leftover", () => {
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

	const session = {
		id: "s1",
		appName: "app",
		userId: "u",
		state: {},
		events: [],
		lastUpdateTime: 0,
	};

	it.each([
		"0",
		"false",
	])('eventToStorageEvent keeps "%s" on flag columns (not null)', (value) => {
		const row = (service as any).eventToStorageEvent(session, {
			id: "e1",
			invocationId: "inv",
			author: "agent",
			branch: value,
			partial: value,
			turnComplete: value,
			errorCode: value,
			errorMessage: value,
			interrupted: value,
		});
		expect(row.branch).toBe(value);
		expect(row.partial).toBe(value);
		expect(row.turn_complete).toBe(value);
		expect(row.error_code).toBe(value);
		expect(row.error_message).toBe(value);
		expect(row.interrupted).toBe(value);
	});

	it("eventToStorageEvent still maps numeric 0 / false → null (control)", () => {
		const row = (service as any).eventToStorageEvent(session, {
			id: "e1",
			invocationId: "inv",
			author: "agent",
			branch: 0,
			partial: false,
			turnComplete: 0,
			errorCode: false,
			errorMessage: 0,
			interrupted: false,
		});
		expect(row.branch).toBeNull();
		expect(row.partial).toBeNull();
		expect(row.turn_complete).toBeNull();
		expect(row.error_code).toBeNull();
		expect(row.error_message).toBeNull();
		expect(row.interrupted).toBeNull();
	});

	it.each([
		"0",
		"false",
	])('storageEventToEvent keeps "%s"; isFinalResponse stays false', (value) => {
		const event = (service as any).storageEventToEvent({
			id: "e1",
			invocation_id: "inv",
			author: "agent",
			branch: value,
			timestamp: new Date("2020-01-01T00:00:00.000Z"),
			content: null,
			actions: null,
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: value,
			turn_complete: value,
			error_code: value,
			error_message: value,
			interrupted: value,
		});
		expect(event.branch).toBe(value);
		expect(event.partial).toBe(value);
		expect(event.turnComplete).toBe(value);
		expect(event.errorCode).toBe(value);
		expect(event.errorMessage).toBe(value);
		expect(event.interrupted).toBe(value);
		expect(event.isFinalResponse()).toBe(false);
	});

	it("storageEventToEvent still maps false → undefined (fourteenth control)", () => {
		const event = (service as any).storageEventToEvent({
			id: "e1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date("2020-01-01T00:00:00.000Z"),
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
});
