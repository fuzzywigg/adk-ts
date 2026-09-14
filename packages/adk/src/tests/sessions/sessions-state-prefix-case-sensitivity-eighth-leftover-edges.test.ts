import { beforeEach, describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { DatabaseSessionService } from "../../sessions/database-session-service";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { State } from "../../sessions/state";

/**
 * Leftover: extractStateDelta / in-memory app-bucket use case-sensitive
 * startsWith(app:|user:|temp:) — APP:/User:/TEMP: stay session-local.
 */
describe("sessions state prefix case-sensitivity eighth leftover edges", () => {
	let dbService: DatabaseSessionService;

	beforeEach(async () => {
		const Database = require("better-sqlite3");
		const { Kysely, SqliteDialect } = await import("kysely");
		const db = new Kysely({
			dialect: new SqliteDialect({
				database: new Database(":memory:"),
			}),
		});
		dbService = new DatabaseSessionService({ db });
	});

	it("only exact lowercase prefixes bucket; cased variants stay session-local", () => {
		const extract = (dbService as any).extractStateDelta.bind(dbService);
		expect(
			extract({
				[`${State.APP_PREFIX}ok`]: 1,
				"APP:ok": 2,
				"App:ok": 3,
				[`${State.USER_PREFIX}ok`]: 4,
				"USER:ok": 5,
				"User:ok": 6,
				[`${State.TEMP_PREFIX}drop`]: 7,
				"TEMP:keep": 8,
				"Temp:keep": 9,
				plain: 10,
			}),
		).toEqual({
			appStateDelta: { ok: 1 },
			userStateDelta: { ok: 4 },
			sessionStateDelta: {
				"APP:ok": 2,
				"App:ok": 3,
				"USER:ok": 5,
				"User:ok": 6,
				"TEMP:keep": 8,
				"Temp:keep": 9,
				plain: 10,
			},
		});
	});

	it("in-memory append buckets only exact app:/user: (APP: stays session-only)", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");

		await service.appendEvent(
			session,
			new Event({
				id: "e1",
				invocationId: "inv",
				author: "agent",
				timestamp: 1,
				actions: new EventActions({
					stateDelta: {
						[`${State.APP_PREFIX}shared`]: "app-val",
						"APP:shared": "session-val",
						[`${State.USER_PREFIX}pref`]: "user-val",
						"USER:pref": "session-user",
					},
				}),
			}),
		);

		expect((service as any).appState.get("app")?.get("shared")).toBe("app-val");
		expect((service as any).appState.get("app")?.has("APP:shared")).toBe(false);
		expect(
			(service as any).userState.get("app")?.get("user")?.get("pref"),
		).toBe("user-val");

		const reloaded = await service.getSession("app", "user", "s1");
		expect(reloaded?.state[`${State.APP_PREFIX}shared`]).toBe("app-val");
		expect(reloaded?.state["APP:shared"]).toBe("session-val");
		expect(reloaded?.state[`${State.USER_PREFIX}pref`]).toBe("user-val");
		expect(reloaded?.state["USER:pref"]).toBe("session-user");
	});
});
