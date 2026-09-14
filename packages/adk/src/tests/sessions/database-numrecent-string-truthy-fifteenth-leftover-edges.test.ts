import { beforeEach, describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Fifteenth leftover: DB `if (config?.numRecentEvents)` — string "2"/"0" are
 * truthy (unlike numeric 0 ninth leftover). "0" still applies limit("0").
 */
describe("database numRecentEvents string truthy fifteenth leftover", () => {
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
		const session = await service.createSession("app", "user", {}, "cfg-str");
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

	it('numRecentEvents: "2" is truthy and limits to 2', async () => {
		await seedThreeEvents();
		const loaded = await service.getSession("app", "user", "cfg-str", {
			numRecentEvents: "2" as any,
		});
		expect(loaded?.events).toHaveLength(2);
	});

	it('numRecentEvents: "0" is truthy so limit runs (length asymmetry vs numeric 0)', async () => {
		await seedThreeEvents();
		const stringZero = await service.getSession("app", "user", "cfg-str", {
			numRecentEvents: "0" as any,
		});
		const numericZero = await service.getSession("app", "user", "cfg-str", {
			numRecentEvents: 0,
		});
		expect(numericZero?.events).toHaveLength(3);
		// SQLite LIMIT 0 yields empty; string "0" still engages the limit branch
		expect(stringZero?.events).toHaveLength(0);
	});
});
