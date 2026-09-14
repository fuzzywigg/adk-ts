import { beforeEach, describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Leftover: boolean false → storage null via || null → loaded undefined via || undefined.
 * Full append→getSession roundtrip documents the boolean loss.
 */
describe("database-session boolean-false roundtrip leftover edges", () => {
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

	it("eventToStorageEvent maps false flags to null", () => {
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
				partial: false,
				turnComplete: false,
				interrupted: false,
			},
		);
		expect(row.partial).toBeNull();
		expect(row.turn_complete).toBeNull();
		expect(row.interrupted).toBeNull();
	});

	it("storageEventToEvent maps null/false-ish flags to undefined", () => {
		const convert = (service as any).storageEventToEvent.bind(service);
		const event = convert({
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
	});

	it("append+getSession loses false boolean flags (null storage path)", async () => {
		const session = await service.createSession("app", "user", {}, "bool-rt");
		const event = new Event({
			id: "e-false",
			author: "agent",
			invocationId: "inv",
			partial: false,
			content: { role: "model", parts: [{ text: "hi" }] },
		});
		event.turnComplete = false;
		event.interrupted = false;
		await service.appendEvent(session, event);

		const loaded = await service.getSession("app", "user", "bool-rt");
		expect(loaded?.events).toHaveLength(1);
		expect(loaded!.events[0].partial).toBeUndefined();
		expect(loaded!.events[0].turnComplete).toBeUndefined();
		expect(loaded!.events[0].interrupted).toBeUndefined();
	});

	it("eventToStorageEvent keeps true flags as boolean true (SQLite bind trap)", () => {
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
				partial: true,
				turnComplete: true,
				interrupted: true,
			},
		);
		expect(row.partial).toBe(true);
		expect(row.turn_complete).toBe(true);
		expect(row.interrupted).toBe(true);
	});

	it("append with true boolean flags rejects under better-sqlite3 bind rules", async () => {
		const session = await service.createSession("app", "user", {}, "bool-true");
		const event = new Event({
			id: "e-true",
			author: "agent",
			invocationId: "inv",
			content: { role: "model", parts: [{ text: "done" }] },
		});
		event.turnComplete = true;
		event.interrupted = true;
		await expect(service.appendEvent(session, event)).rejects.toThrow(
			/SQLite3 can only bind/,
		);
	});

	it("storageEventToEvent recovers numeric 1 flags as truthy (simulates sqlite int)", () => {
		const convert = (service as any).storageEventToEvent.bind(service);
		const event = convert({
			id: "e1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date("2020-01-01T00:00:00.000Z"),
			content: null,
			actions: null,
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: 1,
			turn_complete: 1,
			error_code: null,
			error_message: null,
			interrupted: 1,
		});
		expect(event.partial).toBe(1);
		expect(event.turnComplete).toBe(1);
		expect(event.interrupted).toBe(1);
		expect(event.isFinalResponse()).toBe(false);
	});

	it("mixed false/true: false coalesces to null; true remains boolean for bind", () => {
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
				id: "e-mix",
				invocationId: "inv",
				author: "agent",
				partial: false,
				turnComplete: true,
				interrupted: false,
			},
		);
		expect(row.partial).toBeNull();
		expect(row.turn_complete).toBe(true);
		expect(row.interrupted).toBeNull();
	});
});
