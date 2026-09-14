import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";
import { State } from "../../sessions/state";

/**
 * Tenth leftover: extractStateDelta is if / else if APP then USER then not TEMP —
 * a key starting with both prefixes is claimed by APP first (`app:user:x`).
 */
describe("database-session extractStateDelta prefix overlap tenth leftover edges", () => {
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

	function extract(state: Record<string, unknown>) {
		return (service as any).extractStateDelta(state);
	}

	it("app:user:x is claimed by APP_PREFIX (not USER)", () => {
		expect(
			extract({
				[`${State.APP_PREFIX}${State.USER_PREFIX}x`]: 1,
			}),
		).toEqual({
			appStateDelta: { [`${State.USER_PREFIX}x`]: 1 },
			userStateDelta: {},
			sessionStateDelta: {},
		});
	});

	it("user:app:x is claimed by USER_PREFIX (APP is else-if)", () => {
		expect(
			extract({
				[`${State.USER_PREFIX}${State.APP_PREFIX}x`]: 2,
			}),
		).toEqual({
			appStateDelta: {},
			userStateDelta: { [`${State.APP_PREFIX}x`]: 2 },
			sessionStateDelta: {},
		});
	});

	it("temp:app:x is dropped (TEMP last) even though remainder looks like APP", () => {
		expect(
			extract({
				[`${State.TEMP_PREFIX}${State.APP_PREFIX}x`]: 3,
			}),
		).toEqual({
			appStateDelta: {},
			userStateDelta: {},
			sessionStateDelta: {},
		});
	});

	it("plain app: / user: still split (control)", () => {
		expect(
			extract({
				[`${State.APP_PREFIX}theme`]: "dark",
				[`${State.USER_PREFIX}locale`]: "en",
				local: 0,
			}),
		).toEqual({
			appStateDelta: { theme: "dark" },
			userStateDelta: { locale: "en" },
			sessionStateDelta: { local: 0 },
		});
	});
});
