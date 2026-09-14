import { beforeEach, describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { DatabaseSessionService } from "../../sessions/database-session-service";
import { State } from "../../sessions/state";

/**
 * Leftover: updateSession JSON.stringifies the merged getSession view
 * (including app:/user: keys) without extractStateDelta — pollutes session blob.
 */
describe("database-session update merged-state blob leftover edges", () => {
	let service: DatabaseSessionService;
	let db: any;

	beforeEach(async () => {
		const Database = require("better-sqlite3");
		const { Kysely, SqliteDialect } = await import("kysely");
		db = new Kysely({
			dialect: new SqliteDialect({
				database: new Database(":memory:"),
			}),
		});
		service = new DatabaseSessionService({ db });
	});

	it("updateSession persists prefixed app:/user: keys into sessions.state blob", async () => {
		const session = await service.createSession("app", "user", {}, "merge-1");
		await service.appendEvent(
			session,
			new Event({
				id: "e1",
				author: "agent",
				invocationId: "inv",
				actions: new EventActions({
					stateDelta: {
						[`${State.APP_PREFIX}theme`]: "dark",
						[`${State.USER_PREFIX}locale`]: "en",
						local: "session-val",
					},
				}),
			}),
		);

		const merged = await service.getSession("app", "user", "merge-1");
		expect(merged!.state[`${State.APP_PREFIX}theme`]).toBe("dark");
		expect(merged!.state[`${State.USER_PREFIX}locale`]).toBe("en");
		expect(merged!.state.local).toBe("session-val");

		await service.updateSession(merged!);

		const raw = await db
			.selectFrom("sessions")
			.selectAll()
			.where("id", "=", "merge-1")
			.executeTakeFirstOrThrow();
		const blob = JSON.parse(raw.state);
		expect(blob[`${State.APP_PREFIX}theme`]).toBe("dark");
		expect(blob[`${State.USER_PREFIX}locale`]).toBe("en");
		expect(blob.local).toBe("session-val");
	});

	it("after wiping app_states, getSession still surfaces stale app: from session blob", async () => {
		const session = await service.createSession("app", "user", {}, "merge-2");
		await service.appendEvent(
			session,
			new Event({
				id: "e1",
				author: "agent",
				invocationId: "inv",
				actions: new EventActions({
					stateDelta: {
						[`${State.APP_PREFIX}theme`]: "dark",
						local: "x",
					},
				}),
			}),
		);
		const merged = await service.getSession("app", "user", "merge-2");
		await service.updateSession(merged!);

		await db
			.updateTable("app_states")
			.set({ state: "{}" })
			.where("app_name", "=", "app")
			.execute();

		const reloaded = await service.getSession("app", "user", "merge-2");
		expect(reloaded!.state[`${State.APP_PREFIX}theme`]).toBe("dark");
		expect(reloaded!.state.local).toBe("x");
	});

	it("fresh app_states overwrite still wins when merge re-prefixes after update pollution", async () => {
		const session = await service.createSession("app", "user", {}, "merge-3");
		await service.appendEvent(
			session,
			new Event({
				id: "e1",
				author: "agent",
				invocationId: "inv",
				actions: new EventActions({
					stateDelta: { [`${State.APP_PREFIX}theme`]: "stale" },
				}),
			}),
		);
		const merged = await service.getSession("app", "user", "merge-3");
		await service.updateSession(merged!);

		await db
			.updateTable("app_states")
			.set({ state: JSON.stringify({ theme: "fresh" }) })
			.where("app_name", "=", "app")
			.execute();

		const reloaded = await service.getSession("app", "user", "merge-3");
		expect(reloaded!.state[`${State.APP_PREFIX}theme`]).toBe("fresh");
	});

	it("updateSession with plain unprefixed state does not invent prefixes", async () => {
		const session = await service.createSession(
			"app",
			"user",
			{ a: 1 },
			"plain",
		);
		session.state = { a: 2, b: 3 };
		await service.updateSession(session);
		const raw = await db
			.selectFrom("sessions")
			.selectAll()
			.where("id", "=", "plain")
			.executeTakeFirstOrThrow();
		expect(JSON.parse(raw.state)).toEqual({ a: 2, b: 3 });
	});
});
