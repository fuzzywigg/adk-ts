import { beforeEach, describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Leftover: empty Set is truthy → JSON "[]" not null;
 * storage roundtrip recovers empty Set vs undefined asymmetry.
 */
describe("database-session empty-set longRunningToolIds leftover edges", () => {
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

	it("eventToStorageEvent serializes empty Set as [] json not null", () => {
		const toStorage = (service as any).eventToStorageEvent.bind(service);
		const row = toStorage(
			{
				id: "s",
				appName: "a",
				userId: "u",
				state: {},
				events: [],
				lastUpdateTime: 0,
			},
			{
				id: "e1",
				invocationId: "inv",
				author: "agent",
				longRunningToolIds: new Set(),
			},
		);
		expect(row.long_running_tool_ids_json).toBe("[]");
	});

	it("storageEventToEvent recovers empty array json as empty Set", () => {
		const convert = (service as any).storageEventToEvent.bind(service);
		const event = convert({
			id: "e1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date("2020-01-01T00:00:00.000Z"),
			content: null,
			actions: null,
			long_running_tool_ids_json: "[]",
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
		});
		expect(event.longRunningToolIds).toEqual(new Set());
	});

	it("append+getSession empty Set roundtrips to empty Set not undefined", async () => {
		const session = await service.createSession("app", "user", {}, "empty-set");
		await service.appendEvent(
			session,
			new Event({
				id: "e-empty",
				author: "agent",
				invocationId: "inv",
				longRunningToolIds: new Set(),
			}),
		);
		const loaded = await service.getSession("app", "user", "empty-set");
		expect(loaded!.events[0].longRunningToolIds).toEqual(new Set());
	});

	it("omitted longRunningToolIds stays undefined through roundtrip", async () => {
		const session = await service.createSession("app", "user", {}, "omit-set");
		await service.appendEvent(
			session,
			new Event({
				id: "e-omit",
				author: "agent",
				invocationId: "inv",
			}),
		);
		const loaded = await service.getSession("app", "user", "omit-set");
		expect(loaded!.events[0].longRunningToolIds).toBeUndefined();
	});
});
