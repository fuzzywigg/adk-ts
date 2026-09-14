import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Thirteenth leftover: DB createSession uses `sessionId?.trim() || generate`.
 * Same trim-or-generate trap as in-memory (Vertex does not trim).
 */
describe("database-session sessionId trim-or-generate thirteenth leftover edges", () => {
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

	it.each([
		"",
		"   ",
	])("falsy-after-trim sessionId %j generates a new id", async (sessionId) => {
		const session = await service.createSession("app", "u", {}, sessionId);
		expect(session.id).not.toBe(sessionId);
		expect(session.id.length).toBeGreaterThan(0);
	});

	it("pads are stripped so stored id is trimmed", async () => {
		const session = await service.createSession("app", "u", {}, "  db-sid  ");
		expect(session.id).toBe("db-sid");
		expect(await service.getSession("app", "u", "db-sid")).toBeDefined();
		expect(await service.getSession("app", "u", "  db-sid  ")).toBeUndefined();
	});

	it("explicit id is kept (control)", async () => {
		const session = await service.createSession("app", "u", {}, "keep-me");
		expect(session.id).toBe("keep-me");
	});
});
