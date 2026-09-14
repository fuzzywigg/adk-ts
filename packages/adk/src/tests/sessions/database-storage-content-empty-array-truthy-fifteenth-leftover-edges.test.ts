import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";
import { Event } from "../../events/event";

/**
 * Fifteenth leftover: eventToStorageEvent `content ? JSON.stringify : null` —
 * empty array/object are truthy → serialized; 0/false/"" → null.
 */
describe("database storage content empty-array truthy fifteenth leftover", () => {
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
			userId: "u",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};
	}

	it.each([
		{ label: "[]", content: [], expected: "[]" },
		{ label: "{}", content: {}, expected: "{}" },
	] as const)("truthy content $label is JSON.stringified", ({
		content,
		expected,
	}) => {
		const toStorage = (service as any).eventToStorageEvent.bind(service);
		const row = toStorage(
			session(),
			new Event({
				author: "agent",
				content: content as any,
			}),
		);
		expect(row.content).toBe(expected);
	});

	it.each([
		{ label: "0", content: 0 },
		{ label: "false", content: false },
		{ label: '""', content: "" },
	] as const)("falsy content $label becomes null", ({ content }) => {
		const toStorage = (service as any).eventToStorageEvent.bind(service);
		const row = toStorage(
			session(),
			new Event({
				author: "agent",
				content: content as any,
			}),
		);
		expect(row.content).toBeNull();
	});
});
