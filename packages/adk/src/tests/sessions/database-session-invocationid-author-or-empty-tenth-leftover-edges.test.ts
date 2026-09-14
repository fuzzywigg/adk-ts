import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";

/**
 * Tenth leftover: eventToStorageEvent uses `invocationId || ""` and
 * `author || ""` — falsy 0/false/undefined become empty string; "0" stays.
 */
describe("database-session invocationId/author || empty tenth leftover edges", () => {
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

	function toStorage(event: Record<string, unknown>) {
		return (service as any).eventToStorageEvent(
			{
				id: "s",
				appName: "a",
				userId: "u",
				state: {},
				events: [],
				lastUpdateTime: 0,
			},
			{ id: "e1", ...event },
		);
	}

	it.each([
		{ label: "undefined", invocationId: undefined },
		{ label: "empty string", invocationId: "" },
		{ label: "0", invocationId: 0 },
		{ label: "false", invocationId: false },
		{ label: "null", invocationId: null },
	])("falsy invocationId ($label) coalesces to empty string", ({
		invocationId,
	}) => {
		expect(toStorage({ invocationId, author: "agent" }).invocation_id).toBe("");
	});

	it.each([
		{ label: "undefined", author: undefined },
		{ label: "empty string", author: "" },
		{ label: "0", author: 0 },
		{ label: "false", author: false },
		{ label: "null", author: null },
	])("falsy author ($label) coalesces to empty string", ({ author }) => {
		expect(toStorage({ invocationId: "inv", author }).author).toBe("");
	});

	it('truthy string "0" is kept for both fields (control)', () => {
		const row = toStorage({ invocationId: "0", author: "0" });
		expect(row.invocation_id).toBe("0");
		expect(row.author).toBe("0");
	});

	it("whitespace author/invocationId are kept (truthy)", () => {
		const row = toStorage({ invocationId: " ", author: " " });
		expect(row.invocation_id).toBe(" ");
		expect(row.author).toBe(" ");
	});
});
