import { beforeEach, describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Fifteenth leftover: DB getSession uses independent truthy gates for
 * `numRecentEvents` and `afterTimestamp` (not Vertex elif). String `"0"` /
 * `"2"` are truthy so limit/filter still apply; numeric 0 skips.
 */
describe("database-session config string-truthy independent fifteenth leftover", () => {
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

	async function seedThree() {
		const session = await service.createSession(
			"app",
			"user",
			{},
			"cfg-str-15",
		);
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

	it('numRecentEvents: "2" is truthy so limit still applies', async () => {
		await seedThree();
		const loaded = await service.getSession("app", "user", "cfg-str-15", {
			numRecentEvents: "2" as any,
		});
		expect(loaded?.events).toHaveLength(2);
	});

	it('numRecentEvents: "0" is truthy so limit(0) yields empty events', async () => {
		await seedThree();
		const loaded = await service.getSession("app", "user", "cfg-str-15", {
			numRecentEvents: "0" as any,
		});
		expect(loaded?.events).toHaveLength(0);
	});

	it("numeric 0 still skips limit (control asymmetry)", async () => {
		await seedThree();
		const loaded = await service.getSession("app", "user", "cfg-str-15", {
			numRecentEvents: 0,
		});
		expect(loaded?.events).toHaveLength(3);
	});

	it("string numRecentEvents and afterTimestamp both can apply", async () => {
		await seedThree();
		const loaded = await service.getSession("app", "user", "cfg-str-15", {
			numRecentEvents: "2" as any,
			afterTimestamp: 0,
		});
		// afterTimestamp: 0 is falsy so skipped; string "2" still limits
		expect(loaded?.events).toHaveLength(2);
	});
});
