import { beforeEach, describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { BaseSessionService } from "../../sessions/base-session-service";
import { DatabaseSessionService } from "../../sessions/database-session-service";
import type { Session } from "../../sessions/session";
import { State } from "../../sessions/state";

class ProbeBase extends BaseSessionService {
	async createSession(): Promise<Session> {
		throw new Error("unused");
	}
	async getSession(): Promise<Session | undefined> {
		throw new Error("unused");
	}
	async listSessions() {
		return { sessions: [] };
	}
	async deleteSession(): Promise<void> {}
	exposeUpdate(session: Session, event: Event) {
		(this as any).updateSessionState(session, event);
	}
}

/**
 * Leftover cross-impl asymmetry:
 * Base deletes null/undefined and skips temp_; DB assigns null and skips temp:.
 */
describe("base vs database nullish state-delta asymmetry leftover edges", () => {
	let db: DatabaseSessionService;
	let base: ProbeBase;

	beforeEach(async () => {
		const Database = require("better-sqlite3");
		const { Kysely, SqliteDialect } = await import("kysely");
		const kysely = new Kysely({
			dialect: new SqliteDialect({
				database: new Database(":memory:"),
			}),
		});
		db = new DatabaseSessionService({ db: kysely });
		base = new ProbeBase();
	});

	function session(state: Record<string, any> = { keep: 1, gone: 2 }): Session {
		return {
			id: "s",
			appName: "app",
			userId: "user",
			state: { ...state },
			events: [],
			lastUpdateTime: 0,
		};
	}

	it("Base deletes null/undefined keys; DB assigns null", () => {
		const baseSession = session();
		const dbSession = session();
		const event = new Event({
			author: "a",
			actions: new EventActions({
				stateDelta: { gone: null, also: undefined, keep: 9 },
			}),
		});
		base.exposeUpdate(baseSession, event);
		(db as any).updateSessionState(dbSession, event);

		expect(baseSession.state).toEqual({ keep: 9 });
		expect("gone" in baseSession.state).toBe(false);
		expect("also" in baseSession.state).toBe(false);

		expect(dbSession.state.keep).toBe(9);
		expect(dbSession.state.gone).toBeNull();
		expect(dbSession.state.also).toBeUndefined();
		expect("gone" in dbSession.state).toBe(true);
		expect("also" in dbSession.state).toBe(true);
	});

	it("Base skips temp_ prefix; DB does not skip temp_ (only temp:)", () => {
		const baseSession = session({ a: 1 });
		const dbSession = session({ a: 1 });
		const event = new Event({
			author: "a",
			actions: new EventActions({
				stateDelta: {
					temp_scratch: "x",
					[`${State.TEMP_PREFIX}scratch`]: "y",
					a: 2,
				},
			}),
		});
		base.exposeUpdate(baseSession, event);
		(db as any).updateSessionState(dbSession, event);

		expect(baseSession.state).toEqual({
			a: 2,
			[`${State.TEMP_PREFIX}scratch`]: "y",
		});
		expect(baseSession.state).not.toHaveProperty("temp_scratch");

		expect(dbSession.state).toEqual({
			a: 2,
			temp_scratch: "x",
		});
		expect(dbSession.state).not.toHaveProperty(`${State.TEMP_PREFIX}scratch`);
	});

	it("both skip empty/missing stateDelta", () => {
		const baseSession = session({ a: 1 });
		const dbSession = session({ a: 1 });
		base.exposeUpdate(
			baseSession,
			new Event({ author: "a", actions: new EventActions({}) }),
		);
		(db as any).updateSessionState(
			dbSession,
			new Event({ author: "a", actions: new EventActions({}) }),
		);
		expect(baseSession.state).toEqual({ a: 1 });
		expect(dbSession.state).toEqual({ a: 1 });
	});

	it("matrix: null delete vs assign for prefixed keys", () => {
		const baseSession = session({
			[`${State.APP_PREFIX}k`]: "v",
			[`${State.USER_PREFIX}k`]: "v",
		});
		const dbSession = session({
			[`${State.APP_PREFIX}k`]: "v",
			[`${State.USER_PREFIX}k`]: "v",
		});
		const event = new Event({
			author: "a",
			actions: new EventActions({
				stateDelta: {
					[`${State.APP_PREFIX}k`]: null,
					[`${State.USER_PREFIX}k`]: null,
				},
			}),
		});
		base.exposeUpdate(baseSession, event);
		(db as any).updateSessionState(dbSession, event);

		expect(baseSession.state).toEqual({});
		expect(dbSession.state[`${State.APP_PREFIX}k`]).toBeNull();
		expect(dbSession.state[`${State.USER_PREFIX}k`]).toBeNull();
	});
});
