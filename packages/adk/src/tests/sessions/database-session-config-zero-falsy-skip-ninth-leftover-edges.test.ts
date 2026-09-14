import { beforeEach, describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Leftover: DB getSession uses truthy `if (config?.numRecentEvents)` — 0 skips
 * limit (full history). Storage uses CURRENT_TIMESTAMP so order assertions stay
 * length-based like other DB leftovers.
 */
describe("database-session config zero falsy skip ninth leftover edges", () => {
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

	async function seedThreeEvents() {
		const session = await service.createSession("app", "user", {}, "cfg-zero");
		for (const text of ["a", "b", "c"] as const) {
			await service.appendEvent(
				session,
				new Event({
					author: "agent",
					content: { role: "model", parts: [{ text }] },
				}),
			);
		}
		return session;
	}

	it("numRecentEvents: 0 is falsy and returns full history", async () => {
		await seedThreeEvents();
		const loaded = await service.getSession("app", "user", "cfg-zero", {
			numRecentEvents: 0,
		});
		expect(loaded?.events).toHaveLength(3);
		const texts = loaded?.events.map((e) => e.content?.parts?.[0]?.text) ?? [];
		expect(texts.sort()).toEqual(["a", "b", "c"]);
	});

	it("truthy numRecentEvents: 2 limits row count (control)", async () => {
		await seedThreeEvents();
		const loaded = await service.getSession("app", "user", "cfg-zero", {
			numRecentEvents: 2,
		});
		expect(loaded?.events).toHaveLength(2);
	});

	it("omitted config returns full history (control)", async () => {
		await seedThreeEvents();
		const loaded = await service.getSession("app", "user", "cfg-zero");
		expect(loaded?.events).toHaveLength(3);
	});
});
