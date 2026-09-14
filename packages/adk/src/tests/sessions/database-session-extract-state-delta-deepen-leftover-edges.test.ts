import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";
import { State } from "../../sessions/state";

/**
 * Leftover deepen: extractStateDelta falsy/empty state and prefix-only keys.
 */
describe("database-session extractStateDelta deepen leftover edges", () => {
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
		{ label: "undefined", state: undefined },
		{ label: "null", state: null },
		{ label: "false", state: false },
		{ label: "0", state: 0 },
		{ label: "empty string", state: "" },
	])("falsy state ($label) yields empty deltas via if (state)", ({ state }) => {
		const extract = (service as any).extractStateDelta.bind(service);
		expect(extract(state)).toEqual({
			appStateDelta: {},
			userStateDelta: {},
			sessionStateDelta: {},
		});
	});

	it("empty object yields empty deltas", () => {
		const extract = (service as any).extractStateDelta.bind(service);
		expect(extract({})).toEqual({
			appStateDelta: {},
			userStateDelta: {},
			sessionStateDelta: {},
		});
	});

	it("prefix-only keys with empty suffixes still bucket", () => {
		const extract = (service as any).extractStateDelta.bind(service);
		expect(
			extract({
				[State.APP_PREFIX]: "app-empty-key",
				[State.USER_PREFIX]: "user-empty-key",
				[State.TEMP_PREFIX]: "temp-dropped",
				"": "session-empty-key",
			}),
		).toEqual({
			appStateDelta: { "": "app-empty-key" },
			userStateDelta: { "": "user-empty-key" },
			sessionStateDelta: { "": "session-empty-key" },
		});
	});

	it("temp: keys dropped even when nested-looking", () => {
		const extract = (service as any).extractStateDelta.bind(service);
		expect(
			extract({
				[`${State.TEMP_PREFIX}a`]: 1,
				[`${State.TEMP_PREFIX}`]: 2,
				temp_not_colon: 3,
				[`x${State.TEMP_PREFIX}y`]: 4,
			}),
		).toEqual({
			appStateDelta: {},
			userStateDelta: {},
			sessionStateDelta: {
				temp_not_colon: 3,
				[`x${State.TEMP_PREFIX}y`]: 4,
			},
		});
	});

	it("nullish values still land in the correct buckets", () => {
		const extract = (service as any).extractStateDelta.bind(service);
		expect(
			extract({
				[`${State.APP_PREFIX}a`]: null,
				[`${State.USER_PREFIX}b`]: undefined,
				c: null,
			}),
		).toEqual({
			appStateDelta: { a: null },
			userStateDelta: { b: undefined },
			sessionStateDelta: { c: null },
		});
	});
});
