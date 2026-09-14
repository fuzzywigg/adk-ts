import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { State } from "../../sessions/state";

/**
 * Fourteenth leftover: in-memory append writes null app:/user: values into
 * maps (mergeState surfaces null); BaseSessionService deletes null/undefined
 * session-local keys. Prefix null persistence asymmetry.
 */
describe("in-memory app-user null map persist fourteenth leftover", () => {
	let memory: InMemorySessionService;

	beforeEach(() => {
		memory = new InMemorySessionService();
	});

	it("null app:/user: deltas persist as null via mergeState maps", async () => {
		const session = await memory.createSession(
			"app",
			"u",
			{
				[`${State.APP_PREFIX}theme`]: "dark",
				[`${State.USER_PREFIX}locale`]: "en",
				local: "yes",
			},
			"s1",
		);

		await memory.appendEvent(session, {
			id: "e1",
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}theme`]: null,
					[`${State.USER_PREFIX}locale`]: null,
					local: null,
				},
			},
		} as any);

		const fetched = await memory.getSession("app", "u", "s1");
		expect(fetched?.state[`${State.APP_PREFIX}theme`]).toBeNull();
		expect(fetched?.state[`${State.USER_PREFIX}locale`]).toBeNull();
		// BaseSessionService deletes null session-local keys on the live session
		expect(session.state).not.toHaveProperty("local");
	});

	it("database extractStateDelta still buckets null app values", async () => {
		const Database = require("better-sqlite3");
		const { Kysely, SqliteDialect } = await import("kysely");
		const db = new Kysely({
			dialect: new SqliteDialect({
				database: new Database(":memory:"),
			}),
		});
		const service = new DatabaseSessionService({ db });
		const extracted = (service as any).extractStateDelta({
			[`${State.APP_PREFIX}gone`]: null,
			[`${State.USER_PREFIX}gone`]: null,
			keep: null,
		});
		expect(extracted.appStateDelta).toEqual({ gone: null });
		expect(extracted.userStateDelta).toEqual({ gone: null });
		expect(extracted.sessionStateDelta).toEqual({ keep: null });
	});
});
