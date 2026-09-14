import { beforeEach, describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Fifteenth leftover: `event.content ? JSON.stringify : null` — empty object
 * `{}` is truthy and serializes; contrast falsy scalars already in leftovers.
 * Also locks actions: [] truthy empty-array stringify asymmetry.
 */
describe("database-event content empty-object keep fifteenth leftover", () => {
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

	function session() {
		return {
			id: "s1",
			appName: "app",
			userId: "user",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};
	}

	it('content: {} is truthy so JSON.stringify keeps "{}"', () => {
		const toStorage = (service as any).eventToStorageEvent.bind(service);
		const row = toStorage(session(), {
			id: "e1",
			invocationId: "inv",
			author: "agent",
			content: {},
			actions: undefined,
		});
		expect(row.content).toBe("{}");
	});

	it('actions: [] is truthy so serializes to "[]"', () => {
		const toStorage = (service as any).eventToStorageEvent.bind(service);
		const row = toStorage(session(), {
			id: "e2",
			invocationId: "inv",
			author: "agent",
			content: { role: "model", parts: [] },
			actions: [],
		});
		expect(row.actions).toBe("[]");
		expect(row.content).toBe(JSON.stringify({ role: "model", parts: [] }));
	});

	it('content: "" still maps to null (control)', () => {
		const toStorage = (service as any).eventToStorageEvent.bind(service);
		const row = toStorage(session(), {
			id: "e3",
			invocationId: "inv",
			author: "agent",
			content: "",
			actions: "",
		});
		expect(row.content).toBeNull();
		expect(row.actions).toBeNull();
	});

	it("append round-trip keeps empty parts content object", async () => {
		const created = await service.createSession("app", "u", {}, "empty-obj");
		await service.appendEvent(
			created,
			new Event({
				author: "agent",
				content: { role: "model", parts: [] },
			}),
		);
		const loaded = await service.getSession("app", "u", "empty-obj");
		expect(loaded?.events[0]?.content).toEqual({
			role: "model",
			parts: [],
		});
	});
});
