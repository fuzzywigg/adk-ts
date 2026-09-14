import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Fifteenth leftover: `if (config?.numRecentEvents)` — string "2" is truthy so
 * limit path runs; numeric 0 skips (ninth). Order uses CURRENT_TIMESTAMP so
 * assert length only.
 */
describe("database config string-truthy fifteenth leftover", () => {
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

	it('numRecentEvents: "2" is truthy and limits to 2 events', async () => {
		const session = await service.createSession("app", "u", {}, "s1");
		for (let i = 0; i < 3; i++) {
			await service.appendEvent(session, {
				id: `e${i}`,
				author: "user",
				timestamp: i + 1,
				invocationId: `inv${i}`,
				content: { parts: [{ text: `t${i}` }] },
			} as any);
		}
		const fetched = await service.getSession("app", "u", "s1", {
			numRecentEvents: "2" as any,
		});
		expect(fetched?.events).toHaveLength(2);
	});

	it("numeric 0 numRecent returns all events (control)", async () => {
		const session = await service.createSession("app", "u", {}, "s2");
		for (let i = 0; i < 2; i++) {
			await service.appendEvent(session, {
				id: `e${i}`,
				author: "user",
				timestamp: i + 1,
				invocationId: `inv${i}`,
				content: { parts: [{ text: `t${i}` }] },
			} as any);
		}
		const fetched = await service.getSession("app", "u", "s2", {
			numRecentEvents: 0,
		});
		expect(fetched?.events).toHaveLength(2);
	});
});
