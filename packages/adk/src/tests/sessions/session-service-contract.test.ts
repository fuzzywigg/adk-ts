import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { createSqliteSessionService } from "../../sessions/database-factories";
import type { DatabaseSessionService } from "../../sessions/database-session-service";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import type { Session } from "../../sessions/session";
import { State } from "../../sessions/state";

/**
 * Cross-implementation contract coverage for InMemory vs Database session
 * services. Documents intentional asymmetries rather than forcing parity.
 */
describe("Session service contract (InMemory ↔ Database)", () => {
	let memory: InMemorySessionService;
	let database: DatabaseSessionService;

	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		memory = new InMemorySessionService();
		database = createSqliteSessionService(":memory:");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("createSession initial state prefixes", () => {
		it("Database extracts app:/user:/temp: into tables; InMemory stores as-is", async () => {
			const initial = {
				[`${State.APP_PREFIX}theme`]: "dark",
				[`${State.USER_PREFIX}locale`]: "en",
				counter: 7,
				[`${State.TEMP_PREFIX}scratch`]: "ephemeral",
			};

			const mem = await memory.createSession("app", "user", initial, "m1");
			const db = await database.createSession("app", "user", initial, "d1");

			expect(mem.state[`${State.APP_PREFIX}theme`]).toBe("dark");
			expect(mem.state[`${State.USER_PREFIX}locale`]).toBe("en");
			expect(mem.state.counter).toBe(7);
			expect(mem.state[`${State.TEMP_PREFIX}scratch`]).toBe("ephemeral");

			expect(db.state[`${State.APP_PREFIX}theme`]).toBe("dark");
			expect(db.state[`${State.USER_PREFIX}locale`]).toBe("en");
			expect(db.state.counter).toBe(7);
			expect(db.state[`${State.TEMP_PREFIX}scratch`]).toBeUndefined();
		});

		it("InMemory createSession with app: keys does not seed the appState map", async () => {
			await memory.createSession(
				"app",
				"user",
				{ [`${State.APP_PREFIX}theme`]: "from-create" },
				"seed",
			);
			const sibling = await memory.createSession("app", "user", {}, "sibling");
			expect(sibling.state[`${State.APP_PREFIX}theme`]).toBeUndefined();
		});

		it("Database createSession with app: keys does seed app_states for siblings", async () => {
			await database.createSession(
				"app",
				"user",
				{ [`${State.APP_PREFIX}theme`]: "from-create" },
				"seed",
			);
			const sibling = await database.createSession(
				"app",
				"user",
				{},
				"sibling",
			);
			expect(sibling.state[`${State.APP_PREFIX}theme`]).toBe("from-create");
		});
	});

	describe("listSessions strips events and state", () => {
		async function seedWithHistory(
			service: InMemorySessionService | DatabaseSessionService,
			id: string,
		): Promise<Session> {
			const session = await service.createSession(
				"app",
				"user",
				{ local: 1 },
				id,
			);
			await service.appendEvent(
				session,
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "hi" }] },
					actions: new EventActions({
						stateDelta: { local: 2 },
					}),
				}),
			);
			return session;
		}

		it("both implementations return empty events and empty state on list", async () => {
			await seedWithHistory(memory, "m-list");
			await seedWithHistory(database, "d-list");

			const memListed = await memory.listSessions("app", "user");
			const dbListed = await database.listSessions("app", "user");

			expect(memListed.sessions).toHaveLength(1);
			expect(dbListed.sessions).toHaveLength(1);
			expect(memListed.sessions[0].events).toEqual([]);
			expect(dbListed.sessions[0].events).toEqual([]);
			expect(memListed.sessions[0].state).toEqual({});
			expect(dbListed.sessions[0].state).toEqual({});
		});

		it("getSession still returns events and merged state after list", async () => {
			await seedWithHistory(memory, "m-get");
			await seedWithHistory(database, "d-get");

			const mem = await memory.getSession("app", "user", "m-get");
			const db = await database.getSession("app", "user", "d-get");

			expect(mem?.events).toHaveLength(1);
			expect(db?.events).toHaveLength(1);
			expect(mem?.state.local).toBe(2);
			expect(db?.state.local).toBe(2);
		});
	});

	describe("partial events", () => {
		it("both skip history for partial events", async () => {
			const memSession = await memory.createSession("app", "user", {}, "m-p");
			const dbSession = await database.createSession("app", "user", {}, "d-p");

			const partial = new Event({
				author: "agent",
				partial: true,
				content: { role: "model", parts: [{ text: "stream" }] },
				actions: new EventActions({
					stateDelta: { [`${State.APP_PREFIX}x`]: 1 },
				}),
			});

			await memory.appendEvent(memSession, partial);
			await database.appendEvent(dbSession, partial);

			expect(memSession.events).toHaveLength(0);
			expect(dbSession.events).toHaveLength(0);
			expect(
				(await memory.getSession("app", "user", "m-p"))?.events,
			).toHaveLength(0);
			expect(
				(await database.getSession("app", "user", "d-p"))?.events,
			).toHaveLength(0);
		});

		it("InMemory still applies app/user maps on partial; Database does not", async () => {
			const memSession = await memory.createSession("app", "user", {}, "m-pp");
			const dbSession = await database.createSession("app", "user", {}, "d-pp");

			const partial = new Event({
				author: "agent",
				partial: true,
				timestamp: 42,
				actions: new EventActions({
					stateDelta: {
						[`${State.APP_PREFIX}flag`]: "mem-only",
						[`${State.USER_PREFIX}pref`]: "mem-only",
					},
				}),
			});

			await memory.appendEvent(memSession, partial);
			await database.appendEvent(dbSession, partial);

			const memSibling = await memory.createSession("app", "user", {}, "m-s");
			const dbSibling = await database.createSession("app", "user", {}, "d-s");

			expect(memSibling.state[`${State.APP_PREFIX}flag`]).toBe("mem-only");
			expect(memSibling.state[`${State.USER_PREFIX}pref`]).toBe("mem-only");
			expect(dbSibling.state[`${State.APP_PREFIX}flag`]).toBeUndefined();
			expect(dbSibling.state[`${State.USER_PREFIX}pref`]).toBeUndefined();
		});

		it("InMemory updates lastUpdateTime on partial; Database leaves it unchanged", async () => {
			const memSession = await memory.createSession("app", "user", {}, "m-lut");
			const dbSession = await database.createSession(
				"app",
				"user",
				{},
				"d-lut",
			);
			const memBefore = memSession.lastUpdateTime;
			const dbBefore = dbSession.lastUpdateTime;

			await memory.appendEvent(
				memSession,
				new Event({
					author: "agent",
					partial: true,
					timestamp: 9999,
					content: { parts: [{ text: "x" }] },
				}),
			);
			await database.appendEvent(
				dbSession,
				new Event({
					author: "agent",
					partial: true,
					timestamp: 9999,
					content: { parts: [{ text: "x" }] },
				}),
			);

			expect(memSession.lastUpdateTime).toBe(9999);
			expect(dbSession.lastUpdateTime).toBe(dbBefore);
			expect(memSession.lastUpdateTime).not.toBe(memBefore);
		});
	});

	describe("null and undefined stateDelta values", () => {
		it("Base/InMemory delete session keys on null/undefined; Database assigns null", async () => {
			const memSession = await memory.createSession(
				"app",
				"user",
				{ keep: 1, drop: 2 },
				"m-null",
			);
			const dbSession = await database.createSession(
				"app",
				"user",
				{ keep: 1, drop: 2 },
				"d-null",
			);

			await memory.appendEvent(
				memSession,
				new Event({
					author: "agent",
					actions: new EventActions({
						stateDelta: { drop: null, keep: 3 },
					}),
				}),
			);
			await database.appendEvent(
				dbSession,
				new Event({
					author: "agent",
					actions: new EventActions({
						stateDelta: { drop: null, keep: 3 },
					}),
				}),
			);

			expect(memSession.state.keep).toBe(3);
			expect(memSession.state.drop).toBeUndefined();
			expect("drop" in memSession.state).toBe(false);

			expect(dbSession.state.keep).toBe(3);
			expect(dbSession.state.drop).toBeNull();
		});

		it("InMemory stores null into app/user maps; Database also persists null app/user values", async () => {
			const memSession = await memory.createSession("app", "user", {}, "m-au");
			const dbSession = await database.createSession("app", "user", {}, "d-au");

			const delta = new EventActions({
				stateDelta: {
					[`${State.APP_PREFIX}a`]: null,
					[`${State.USER_PREFIX}u`]: null,
					sessionKey: "ok",
				},
			});

			await memory.appendEvent(
				memSession,
				new Event({ author: "agent", actions: delta }),
			);
			await database.appendEvent(
				dbSession,
				new Event({
					author: "agent",
					actions: new EventActions({
						stateDelta: {
							[`${State.APP_PREFIX}a`]: null,
							[`${State.USER_PREFIX}u`]: null,
							sessionKey: "ok",
						},
					}),
				}),
			);

			const memFetched = await memory.getSession("app", "user", "m-au");
			const dbFetched = await database.getSession("app", "user", "d-au");

			expect(memFetched?.state[`${State.APP_PREFIX}a`]).toBeNull();
			expect(memFetched?.state[`${State.USER_PREFIX}u`]).toBeNull();
			expect(dbFetched?.state[`${State.APP_PREFIX}a`]).toBeNull();
			expect(dbFetched?.state[`${State.USER_PREFIX}u`]).toBeNull();
			expect(memFetched?.state.sessionKey).toBe("ok");
			expect(dbFetched?.state.sessionKey).toBe("ok");
		});
	});

	describe("GetSessionConfig filtering", () => {
		it("InMemory numRecentEvents returns the last N by event.timestamp", async () => {
			const session = await memory.createSession("app", "user", {}, "m-nr");
			for (let i = 0; i < 5; i++) {
				await memory.appendEvent(
					session,
					new Event({
						author: "agent",
						timestamp: 1000 + i,
						content: { parts: [{ text: `e${i}` }] },
					}),
				);
			}
			const mem = await memory.getSession("app", "user", "m-nr", {
				numRecentEvents: 2,
			});
			expect(mem?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
				"e3",
				"e4",
			]);
		});

		it("Database numRecentEvents returns N events (order may tie on CURRENT_TIMESTAMP)", async () => {
			let session = await database.createSession("app", "user", {}, "d-nr");
			for (let i = 0; i < 5; i++) {
				await database.appendEvent(
					session,
					new Event({
						author: "agent",
						content: { parts: [{ text: `e${i}` }] },
						actions: new EventActions({ stateDelta: { i } }),
					}),
				);
				session = (await database.getSession("app", "user", "d-nr"))!;
				await new Promise((r) => setTimeout(r, 5));
			}
			const db = await database.getSession("app", "user", "d-nr", {
				numRecentEvents: 2,
			});
			expect(db?.events).toHaveLength(2);
		});

		it("InMemory applies numRecentEvents then afterTimestamp (slice uses i+1)", async () => {
			const session = await memory.createSession("app", "user", {}, "m-combo");
			for (let i = 0; i < 5; i++) {
				await memory.appendEvent(
					session,
					new Event({
						author: "agent",
						timestamp: 1000 + i,
						content: { parts: [{ text: `e${i}` }] },
					}),
				);
			}
			const mem = await memory.getSession("app", "user", "m-combo", {
				numRecentEvents: 3,
				afterTimestamp: 1002.5,
			});
			expect(mem?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
				"e3",
				"e4",
			]);
		});

		it("Database afterTimestamp with Date binding fails on sqlite", async () => {
			const session = await database.createSession(
				"app",
				"user",
				{},
				"d-combo",
			);
			await database.appendEvent(
				session,
				new Event({
					author: "agent",
					content: { parts: [{ text: "x" }] },
					actions: new EventActions({ stateDelta: { x: 1 } }),
				}),
			);
			await expect(
				database.getSession("app", "user", "d-combo", {
					afterTimestamp: 1002,
				}),
			).rejects.toThrow(/SQLite3 can only bind/);
		});
	});

	describe("duplicate session ids", () => {
		it("InMemory overwrites; Database rejects", async () => {
			await memory.createSession("app", "user", { v: 1 }, "same");
			const overwritten = await memory.createSession(
				"app",
				"user",
				{ v: 2 },
				"same",
			);
			expect(overwritten.state.v).toBe(2);

			await database.createSession("app", "user", { v: 1 }, "same");
			await expect(
				database.createSession("app", "user", { v: 2 }, "same"),
			).rejects.toThrow();
		});
	});

	describe("appendEvent without stateDelta", () => {
		it("both append content-only events and update history", async () => {
			const memSession = await memory.createSession("app", "user", {}, "m-c");
			const dbSession = await database.createSession("app", "user", {}, "d-c");

			await memory.appendEvent(
				memSession,
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "ping" }] },
					actions: new EventActions({}),
				}),
			);
			await database.appendEvent(
				dbSession,
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "ping" }] },
					actions: new EventActions({}),
				}),
			);

			expect(
				(await memory.getSession("app", "user", "m-c"))?.events,
			).toHaveLength(1);
			expect(
				(await database.getSession("app", "user", "d-c"))?.events,
			).toHaveLength(1);
		});

		it("actions present without stateDelta does not throw", async () => {
			const memSession = await memory.createSession("app", "user", {}, "m-a");
			await memory.appendEvent(
				memSession,
				new Event({
					author: "agent",
					timestamp: 1,
					actions: new EventActions({ escalate: true }),
				}),
			);
			expect(memSession.events).toHaveLength(1);
			expect(memSession.events[0].actions?.escalate).toBe(true);
		});
	});

	describe("temp: key asymmetries", () => {
		it("InMemory Base skips only temp_ underscore; Database extractStateDelta skips temp:", async () => {
			const memSession = await memory.createSession("app", "user", {}, "m-t");
			const dbSession = await database.createSession("app", "user", {}, "d-t");

			await memory.appendEvent(
				memSession,
				new Event({
					author: "agent",
					actions: new EventActions({
						stateDelta: {
							[`${State.TEMP_PREFIX}x`]: "colon",
							temp_y: "underscore",
							visible: true,
						},
					}),
				}),
			);
			await database.appendEvent(
				dbSession,
				new Event({
					author: "agent",
					actions: new EventActions({
						stateDelta: {
							[`${State.TEMP_PREFIX}x`]: "colon",
							temp_y: "underscore",
							visible: true,
						},
					}),
				}),
			);

			expect(memSession.state[`${State.TEMP_PREFIX}x`]).toBe("colon");
			expect(memSession.state.temp_y).toBeUndefined();
			expect(dbSession.state[`${State.TEMP_PREFIX}x`]).toBeUndefined();
			expect(dbSession.state.temp_y).toBe("underscore");
			expect(memSession.state.visible).toBe(true);
			expect(dbSession.state.visible).toBe(true);
		});
	});

	describe("deleteSession", () => {
		it("both make getSession return undefined after delete", async () => {
			await memory.createSession("app", "user", {}, "m-del");
			await database.createSession("app", "user", {}, "d-del");

			await memory.deleteSession("app", "user", "m-del");
			await database.deleteSession("app", "user", "d-del");

			expect(await memory.getSession("app", "user", "m-del")).toBeUndefined();
			expect(await database.getSession("app", "user", "d-del")).toBeUndefined();
		});

		it("delete of missing session is a no-op for InMemory", async () => {
			await expect(
				memory.deleteSession("app", "user", "ghost"),
			).resolves.toBeUndefined();
		});
	});

	describe("app/user state isolation across users", () => {
		it("user: state does not leak across userIds; app: does", async () => {
			const memA = await memory.createSession("app", "alice", {}, "m-a");
			await memory.appendEvent(
				memA,
				new Event({
					author: "agent",
					actions: new EventActions({
						stateDelta: {
							[`${State.APP_PREFIX}shared`]: "yes",
							[`${State.USER_PREFIX}secret`]: "alice-only",
						},
					}),
				}),
			);

			const memB = await memory.createSession("app", "bob", {}, "m-b");
			expect(memB.state[`${State.APP_PREFIX}shared`]).toBe("yes");
			expect(memB.state[`${State.USER_PREFIX}secret`]).toBeUndefined();

			const dbA = await database.createSession("app", "alice", {}, "d-a");
			await database.appendEvent(
				dbA,
				new Event({
					author: "agent",
					actions: new EventActions({
						stateDelta: {
							[`${State.APP_PREFIX}shared`]: "yes",
							[`${State.USER_PREFIX}secret`]: "alice-only",
						},
					}),
				}),
			);
			const dbB = await database.createSession("app", "bob", {}, "d-b");
			expect(dbB.state[`${State.APP_PREFIX}shared`]).toBe("yes");
			expect(dbB.state[`${State.USER_PREFIX}secret`]).toBeUndefined();
		});
	});

	describe("whitespace session ids", () => {
		it("InMemory trims blank custom ids to a generated UUID", async () => {
			const session = await memory.createSession("app", "user", {}, "   ");
			expect(session.id).not.toBe("   ");
			expect(session.id.length).toBeGreaterThan(0);
		});

		it("Database trims blank custom ids to a generated session- id", async () => {
			const session = await database.createSession("app", "user", {}, "   ");
			expect(session.id).toMatch(/^session-/);
		});
	});
});
