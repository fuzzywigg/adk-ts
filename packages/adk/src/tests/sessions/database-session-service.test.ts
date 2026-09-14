import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { createSqliteSessionService } from "../../sessions/database-factories";
import type { DatabaseSessionService } from "../../sessions/database-session-service";
import { State } from "../../sessions/state";

describe("DatabaseSessionService (sqlite :memory:)", () => {
	let service: DatabaseSessionService;

	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		service = createSqliteSessionService(":memory:");
	});

	afterEach(async () => {
		vi.restoreAllMocks();
	});

	it("creates sessions with generated or custom ids and merges state prefixes", async () => {
		const generated = await service.createSession("app", "user", {
			[`${State.APP_PREFIX}theme`]: "dark",
			[`${State.USER_PREFIX}locale`]: "en",
			counter: 1,
			[`${State.TEMP_PREFIX}scratch`]: "ignored",
		});

		expect(generated.id).toMatch(/^session-/);
		expect(generated.appName).toBe("app");
		expect(generated.userId).toBe("user");
		expect(generated.state[`${State.APP_PREFIX}theme`]).toBe("dark");
		expect(generated.state[`${State.USER_PREFIX}locale`]).toBe("en");
		expect(generated.state.counter).toBe(1);
		expect(generated.state[`${State.TEMP_PREFIX}scratch`]).toBeUndefined();
		expect(generated.events).toEqual([]);

		const custom = await service.createSession(
			"app",
			"user",
			{ local: true },
			"custom-db-id",
		);
		expect(custom.id).toBe("custom-db-id");
		expect(custom.state.local).toBe(true);
	});

	it("gets, lists, updates, and deletes sessions", async () => {
		const created = await service.createSession("app", "user", { a: 1 }, "s1");

		const fetched = await service.getSession("app", "user", "s1");
		expect(fetched?.id).toBe("s1");
		expect(fetched?.state.a).toBe(1);
		expect(await service.getSession("app", "user", "missing")).toBeUndefined();

		const listed = await service.listSessions("app", "user");
		expect(listed.sessions.map((s) => s.id)).toEqual(["s1"]);
		expect(listed.sessions[0].events).toEqual([]);
		expect(listed.sessions[0].state).toEqual({});

		await service.updateSession({
			...created,
			state: { a: 2, b: 3 },
		});
		const updated = await service.getSession("app", "user", "s1");
		expect(updated?.state.a).toBe(2);
		expect(updated?.state.b).toBe(3);

		await service.deleteSession("app", "user", "s1");
		expect(await service.getSession("app", "user", "s1")).toBeUndefined();
		expect((await service.listSessions("app", "user")).sessions).toEqual([]);
	});

	it("appends events with state deltas and round-trips event fields", async () => {
		const session = await service.createSession("app", "user", {}, "s1");
		const event = new Event({
			author: "agent",
			invocationId: "inv-1",
			branch: "root.child",
			content: { role: "model", parts: [{ text: "hello" }] },
			actions: new EventActions({
				stateDelta: {
					[`${State.APP_PREFIX}theme`]: "light",
					[`${State.USER_PREFIX}locale`]: "fr",
					local: "session-only",
					[`${State.TEMP_PREFIX}x`]: "skip",
				},
			}),
			longRunningToolIds: new Set(["tool-1"]),
		});

		const returned = await service.appendEvent(session, event);
		expect(returned.id).toBe(event.id);
		expect(session.lastUpdateTime).toBeGreaterThan(0);

		const fetched = await service.getSession("app", "user", "s1");
		expect(fetched?.events).toHaveLength(1);
		expect(fetched?.events[0].author).toBe("agent");
		expect(fetched?.events[0].invocationId).toBe("inv-1");
		expect(fetched?.events[0].branch).toBe("root.child");
		expect(fetched?.events[0].content).toEqual({
			role: "model",
			parts: [{ text: "hello" }],
		});
		expect(Array.from(fetched?.events[0].longRunningToolIds ?? [])).toEqual([
			"tool-1",
		]);
		expect(fetched?.state[`${State.APP_PREFIX}theme`]).toBe("light");
		expect(fetched?.state[`${State.USER_PREFIX}locale`]).toBe("fr");
		expect(fetched?.state.local).toBe("session-only");
	});

	it("skips partial events without persisting them", async () => {
		const session = await service.createSession("app", "user", {}, "s1");
		const partial = new Event({
			author: "agent",
			partial: true,
			content: { parts: [{ text: "streaming" }] },
		});

		await service.appendEvent(session, partial);
		const fetched = await service.getSession("app", "user", "s1");
		expect(fetched?.events).toHaveLength(0);
	});

	it("filters getSession events by numRecentEvents", async () => {
		const session = await service.createSession("app", "user", {}, "s1");

		await service.appendEvent(
			session,
			new Event({
				author: "user",
				content: { parts: [{ text: "one" }] },
			}),
		);
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				content: { parts: [{ text: "two" }] },
			}),
		);
		await service.appendEvent(
			session,
			new Event({
				author: "user",
				content: { parts: [{ text: "three" }] },
			}),
		);

		const all = await service.getSession("app", "user", "s1");
		expect(all?.events).toHaveLength(3);

		const recent = await service.getSession("app", "user", "s1", {
			numRecentEvents: 2,
		});
		expect(recent?.events).toHaveLength(2);
		const texts = recent?.events.map((e) => e.content?.parts?.[0]?.text) ?? [];
		expect(
			texts.every((t) => ["one", "two", "three"].includes(t as string)),
		).toBe(true);
	});

	it("rejects stale session appends", async () => {
		const session = await service.createSession("app", "user", {}, "s1");
		session.lastUpdateTime = 1;

		await expect(
			service.appendEvent(
				session,
				new Event({
					author: "agent",
					content: { parts: [{ text: "stale" }] },
				}),
			),
		).rejects.toThrow();
	});

	it("lists empty sessions for unknown users", async () => {
		await service.createSession("app", "user-a", {}, "s1");
		expect((await service.listSessions("app", "user-b")).sessions).toEqual([]);
	});

	it("limits getSession events with numRecentEvents across multiple appends", async () => {
		const session = await service.createSession("app", "user", {}, "s-ts");

		await service.appendEvent(
			session,
			new Event({
				author: "user",
				content: { parts: [{ text: "one" }] },
			}),
		);
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				content: { parts: [{ text: "two" }] },
			}),
		);
		await service.appendEvent(
			session,
			new Event({
				author: "user",
				content: { parts: [{ text: "three" }] },
			}),
		);

		const recent = await service.getSession("app", "user", "s-ts", {
			numRecentEvents: 2,
		});
		expect(recent?.events).toHaveLength(2);
		const texts = recent?.events.map((e) => e.content?.parts?.[0]?.text) ?? [];
		expect(
			texts.every((t) => ["one", "two", "three"].includes(t as string)),
		).toBe(true);
	});

	it("appends events without stateDelta and round-trips functionResponse", async () => {
		const session = await service.createSession("app", "user", {}, "s-fr");
		const event = new Event({
			author: "tool",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "call-1",
							name: "lookup",
							response: { ok: true },
						},
					},
				],
			},
		});

		await service.appendEvent(session, event);
		const fetched = await service.getSession("app", "user", "s-fr");
		expect(fetched?.events).toHaveLength(1);
		expect(fetched?.events[0].content?.parts?.[0]?.functionResponse?.name).toBe(
			"lookup",
		);
		expect(fetched?.state).toEqual({});
	});

	it("update and delete are no-ops for missing sessions", async () => {
		await service.updateSession({
			id: "ghost",
			appName: "app",
			userId: "user",
			state: { a: 1 },
			events: [],
			lastUpdateTime: Date.now() / 1000,
		} as any);
		await expect(
			service.deleteSession("app", "user", "ghost"),
		).resolves.toBeUndefined();
		expect(await service.getSession("app", "user", "ghost")).toBeUndefined();
	});

	it("lists sessions across users independently", async () => {
		await service.createSession("app", "alice", {}, "a1");
		await service.createSession("app", "alice", {}, "a2");
		await service.createSession("app", "bob", {}, "b1");

		expect(
			(await service.listSessions("app", "alice")).sessions
				.map((s) => s.id)
				.sort(),
		).toEqual(["a1", "a2"]);
		expect(
			(await service.listSessions("app", "bob")).sessions.map((s) => s.id),
		).toEqual(["b1"]);
	});

	it("round-trips grounding metadata and error string fields", async () => {
		const session = await service.createSession("app", "user", {}, "s-meta");
		const event = new Event({
			author: "agent",
			invocationId: "inv-meta",
			content: { role: "model", parts: [{ text: "meta" }] },
		});
		event.groundingMetadata = {
			searchEntryPoint: { renderedContent: "src" },
		} as any;
		event.errorCode = "E_TEST";
		event.errorMessage = "boom";

		await service.appendEvent(session, event);
		const fetched = await service.getSession("app", "user", "s-meta");
		expect(fetched?.events).toHaveLength(1);
		const stored = fetched!.events[0];
		expect(stored.groundingMetadata).toEqual({
			searchEntryPoint: { renderedContent: "src" },
		});
		expect(stored.errorCode).toBe("E_TEST");
		expect(stored.errorMessage).toBe("boom");
	});

	it("merges existing app and user state across sessions", async () => {
		await service.createSession(
			"app",
			"user",
			{
				[`${State.APP_PREFIX}theme`]: "dark",
				[`${State.USER_PREFIX}locale`]: "en",
				local: 1,
			},
			"s-first",
		);

		const second = await service.createSession(
			"app",
			"user",
			{
				[`${State.APP_PREFIX}theme`]: "light",
				local: 2,
			},
			"s-second",
		);

		expect(second.state[`${State.APP_PREFIX}theme`]).toBe("light");
		expect(second.state[`${State.USER_PREFIX}locale`]).toBe("en");
		expect(second.state.local).toBe(2);

		const first = await service.getSession("app", "user", "s-first");
		expect(first?.state[`${State.APP_PREFIX}theme`]).toBe("light");
		expect(first?.state[`${State.USER_PREFIX}locale`]).toBe("en");
		expect(first?.state.local).toBe(1);
	});

	it("persists event actions and empty content without crashing", async () => {
		const session = await service.createSession("app", "user", {}, "s-actions");
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				actions: new EventActions({
					stateDelta: { flagged: true },
					transferToAgent: "other",
				}),
			}),
		);

		const fetched = await service.getSession("app", "user", "s-actions");
		expect(fetched?.events).toHaveLength(1);
		expect(fetched?.events[0].actions?.transferToAgent).toBe("other");
		expect(fetched?.state.flagged).toBe(true);
	});

	it("trims custom session ids and scopes getSession by app and user", async () => {
		const created = await service.createSession(
			"app",
			"user",
			{ scoped: true },
			"  padded-id  ",
		);
		expect(created.id).toBe("padded-id");

		expect(
			await service.getSession("other-app", "user", "padded-id"),
		).toBeUndefined();
		expect(
			await service.getSession("app", "other-user", "padded-id"),
		).toBeUndefined();
		expect(
			(await service.getSession("app", "user", "padded-id"))?.state.scoped,
		).toBe(true);
	});

	it("deletes empty sessions without affecting siblings", async () => {
		await service.createSession("app", "user", {}, "keep");
		await service.createSession("app", "user", {}, "drop");

		await service.deleteSession("app", "user", "drop");
		expect(await service.getSession("app", "user", "drop")).toBeUndefined();
		expect(await service.getSession("app", "user", "keep")).toBeTruthy();
		expect(
			(await service.listSessions("app", "user")).sessions.map((s) => s.id),
		).toEqual(["keep"]);
	});

	it("rejects deleting sessions that still have events (sqlite FK)", async () => {
		const session = await service.createSession(
			"app",
			"user",
			{},
			"with-events",
		);
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				content: { parts: [{ text: "keep-me" }] },
			}),
		);

		await expect(
			service.deleteSession("app", "user", "with-events"),
		).rejects.toThrow(/FOREIGN KEY/i);
		expect(await service.getSession("app", "user", "with-events")).toBeTruthy();
	});

	it("surfaces sqlite binding errors when afterTimestamp is used", async () => {
		const session = await service.createSession("app", "user", {}, "s-after");
		await service.appendEvent(
			session,
			new Event({
				author: "user",
				content: { parts: [{ text: "x" }] },
			}),
		);

		await expect(
			service.getSession("app", "user", "s-after", {
				afterTimestamp: Date.now() / 1000 - 60,
			}),
		).rejects.toThrow(/bind/i);
	});

	it("parseJsonSafely and timestampToUnixSeconds cover edge inputs", () => {
		expect((service as any).parseJsonSafely(null, { a: 1 })).toEqual({ a: 1 });
		expect((service as any).parseJsonSafely("", { a: 1 })).toEqual({ a: 1 });
		expect((service as any).parseJsonSafely("{bad", { a: 1 })).toEqual({
			a: 1,
		});
		expect((service as any).parseJsonSafely('{"ok":true}', {})).toEqual({
			ok: true,
		});

		const date = new Date("2024-01-01T00:00:00.000Z");
		expect((service as any).timestampToUnixSeconds(date)).toBe(
			date.getTime() / 1000,
		);
		expect(
			(service as any).timestampToUnixSeconds("2024-01-01T00:00:00.000Z"),
		).toBe(date.getTime() / 1000);
		expect((service as any).timestampToUnixSeconds(1_700_000_000)).toBe(
			1_700_000_000,
		);
		expect((service as any).timestampToUnixSeconds(1_700_000_000_000)).toBe(
			1_700_000_000,
		);
		const fallback = (service as any).timestampToUnixSeconds({ weird: true });
		expect(fallback).toBeGreaterThan(0);
	});

	it("skipTableCreation still initializes on first operation", async () => {
		const Database = require("better-sqlite3");
		const { Kysely, SqliteDialect } = await import("kysely");
		const { DatabaseSessionService } = await import(
			"../../sessions/database-session-service"
		);

		const db = new Kysely({
			dialect: new SqliteDialect({
				database: new Database(":memory:"),
			}),
		});
		const deferred = new DatabaseSessionService({
			db,
			skipTableCreation: true,
		});

		const created = await deferred.createSession("app", "user", { x: 1 }, "s1");
		expect(created.id).toBe("s1");
		expect(await deferred.getSession("app", "user", "s1")).toBeDefined();

		await (deferred as any).initializeDatabase();
		await (deferred as any).initializeDatabase();
	});

	it("logs when initializeDatabase fails during construction", async () => {
		vi.useFakeTimers();
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { DatabaseSessionService } = await import(
			"../../sessions/database-session-service"
		);
		const db = {
			schema: {
				createTable: () => ({
					ifNotExists: () => ({
						addColumn: () => {
							throw new Error("schema boom");
						},
					}),
				}),
			},
		};

		new DatabaseSessionService({ db: db as any });
		await vi.runAllTimersAsync();
		expect(errorSpy).toHaveBeenCalledWith(
			"Failed to initialize database:",
			expect.any(Error),
		);
		vi.useRealTimers();
	});

	it("updateSessionState assigns null/undefined instead of deleting keys", () => {
		const session = {
			id: "s",
			appName: "app",
			userId: "user",
			state: { keep: 1, removeMe: "x", also: "y" },
			events: [],
			lastUpdateTime: 0,
		};
		(service as any).updateSessionState(session, {
			actions: {
				stateDelta: {
					removeMe: null,
					also: undefined,
					added: "z",
				},
			},
		});
		expect(session.state.keep).toBe(1);
		expect(session.state.removeMe).toBeNull();
		expect(session.state.also).toBeUndefined();
		expect(Object.hasOwn(session.state, "also")).toBe(true);
		expect(session.state.added).toBe("z");
	});

	it("updateSessionState skips TEMP keys and no-ops without stateDelta", () => {
		const session = {
			id: "s",
			appName: "app",
			userId: "user",
			state: { keep: 1 },
			events: [],
			lastUpdateTime: 0,
		};
		(service as any).updateSessionState(session, {
			actions: undefined,
		});
		expect(session.state).toEqual({ keep: 1 });

		(service as any).updateSessionState(session, {
			actions: {
				stateDelta: {
					keep: 2,
					[`${State.TEMP_PREFIX}tmp`]: "nope",
				},
			},
		});
		expect(session.state.keep).toBe(2);
		expect(session.state[`${State.TEMP_PREFIX}tmp`]).toBeUndefined();
	});

	it("storageEventToEvent helpers cover action bags and empty defaults", () => {
		const empty = (service as any).storageEventToEvent({
			id: "e1",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date(),
			content: null,
			actions: null,
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
		});

		expect(empty.isFinalResponse()).toBe(false);
		expect(empty.getFunctionCalls()).toEqual([]);
		expect(empty.getFunctionResponses()).toEqual([]);
		expect(empty.hasTrailingCodeExecutionResult()).toBe(false);

		const withActions = (service as any).storageEventToEvent({
			id: "e-bool",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date(),
			content: null,
			actions: JSON.stringify({
				functionCalls: [{ name: "x" }],
				functionResponses: [{ name: "x", response: { ok: true } }],
				hasTrailingCodeExecutionResult: true,
			}),
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete: true,
			error_code: null,
			error_message: null,
			interrupted: true,
		});
		expect(withActions.isFinalResponse()).toBe(true);
		expect(withActions.interrupted).toBe(true);
		expect(withActions.getFunctionCalls()).toEqual([{ name: "x" }]);
		expect(withActions.getFunctionResponses()).toEqual([
			{ name: "x", response: { ok: true } },
		]);
		expect(withActions.hasTrailingCodeExecutionResult()).toBe(true);
	});

	it("extractStateDelta handles undefined, TEMP-only, and mixed prefixes", () => {
		expect((service as any).extractStateDelta(undefined)).toEqual({
			appStateDelta: {},
			userStateDelta: {},
			sessionStateDelta: {},
		});

		expect(
			(service as any).extractStateDelta({
				[`${State.TEMP_PREFIX}a`]: 1,
				[`${State.TEMP_PREFIX}b`]: 2,
			}),
		).toEqual({
			appStateDelta: {},
			userStateDelta: {},
			sessionStateDelta: {},
		});

		expect(
			(service as any).extractStateDelta({
				[`${State.APP_PREFIX}theme`]: "dark",
				[`${State.USER_PREFIX}locale`]: "en",
				counter: 3,
				[`${State.TEMP_PREFIX}scratch`]: "x",
			}),
		).toEqual({
			appStateDelta: { theme: "dark" },
			userStateDelta: { locale: "en" },
			sessionStateDelta: { counter: 3 },
		});
	});

	it("createSession with TEMP-only initial state stores empty session delta", async () => {
		const created = await service.createSession(
			"app",
			"user",
			{ [`${State.TEMP_PREFIX}only`]: "gone" },
			"temp-only",
		);
		expect(created.state[`${State.TEMP_PREFIX}only`]).toBeUndefined();
		expect(created.state).toEqual({});

		const fetched = await service.getSession("app", "user", "temp-only");
		expect(fetched?.state).toEqual({});
	});

	it("createSession without state yields empty merged state", async () => {
		const created = await service.createSession("app", "user");
		expect(created.id).toMatch(/^session-/);
		expect(created.state).toEqual({});
		expect(created.events).toEqual([]);
	});

	it("appends app-only, user-only, and session-only state deltas independently", async () => {
		const session = await service.createSession("app", "user", {}, "delta-iso");

		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				actions: new EventActions({
					stateDelta: { [`${State.APP_PREFIX}flag`]: "app" },
				}),
			}),
		);
		let fetched = await service.getSession("app", "user", "delta-iso");
		expect(fetched?.state[`${State.APP_PREFIX}flag`]).toBe("app");

		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				actions: new EventActions({
					stateDelta: { [`${State.USER_PREFIX}name`]: "alice" },
				}),
			}),
		);
		fetched = await service.getSession("app", "user", "delta-iso");
		expect(fetched?.state[`${State.USER_PREFIX}name`]).toBe("alice");

		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				actions: new EventActions({
					stateDelta: { sessionKey: 99 },
				}),
			}),
		);
		fetched = await service.getSession("app", "user", "delta-iso");
		expect(fetched?.state.sessionKey).toBe(99);
		expect(fetched?.events).toHaveLength(3);
	});

	it("eventToStorageEvent serializes default EventActions and nullish optionals", () => {
		const session = {
			id: "s1",
			appName: "app",
			userId: "user",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};
		const event = new Event({ author: "agent" });
		const stored = (service as any).eventToStorageEvent(session, event);

		expect(stored).toMatchObject({
			id: event.id,
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "",
			author: "agent",
			branch: null,
			content: null,
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
		});
		expect(JSON.parse(stored.actions)).toMatchObject({
			stateDelta: {},
			artifactDelta: {},
		});
	});

	it("eventToStorageEvent stringifies content, actions, and metadata", () => {
		const session = {
			id: "s1",
			appName: "app",
			userId: "user",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};
		const event = new Event({
			author: "agent",
			invocationId: "inv",
			branch: "root",
			content: { parts: [{ text: "hi" }] },
			actions: new EventActions({ stateDelta: { a: 1 } }),
			longRunningToolIds: new Set(["t1"]),
			partial: false,
		});
		event.turnComplete = true;
		event.groundingMetadata = { webSearchQueries: ["q"] } as any;
		event.errorCode = "E";
		event.errorMessage = "m";
		event.interrupted = true;

		const stored = (service as any).eventToStorageEvent(session, event);
		expect(JSON.parse(stored.content)).toEqual({ parts: [{ text: "hi" }] });
		expect(JSON.parse(stored.actions).stateDelta).toEqual({ a: 1 });
		expect(JSON.parse(stored.long_running_tool_ids_json)).toEqual(["t1"]);
		expect(JSON.parse(stored.grounding_metadata)).toEqual({
			webSearchQueries: ["q"],
		});
		expect(stored.branch).toBe("root");
		expect(stored.turn_complete).toBe(true);
		expect(stored.error_code).toBe("E");
		expect(stored.interrupted).toBe(true);
	});

	it("storageEventToEvent rebuilds Sets and false hasTrailingCodeExecutionResult", () => {
		const withSet = (service as any).storageEventToEvent({
			id: "e-set",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date("2024-01-01T00:00:00.000Z"),
			content: null,
			actions: JSON.stringify({
				hasTrailingCodeExecutionResult: false,
			}),
			long_running_tool_ids_json: JSON.stringify(["lr-a", "lr-b"]),
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
		});

		expect(Array.from(withSet.longRunningToolIds ?? [])).toEqual([
			"lr-a",
			"lr-b",
		]);
		expect(withSet.hasTrailingCodeExecutionResult()).toBe(false);
		expect(withSet.getFunctionCalls()).toEqual([]);
		expect(withSet.getFunctionResponses()).toEqual([]);
	});

	it("storageEventToEvent treats actions without function helpers as empty", () => {
		const event = (service as any).storageEventToEvent({
			id: "e-plain",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: "b",
			timestamp: new Date(),
			content: JSON.stringify({ parts: [{ text: "x" }] }),
			actions: JSON.stringify({ stateDelta: { k: 1 }, transferToAgent: "c" }),
			long_running_tool_ids_json: null,
			grounding_metadata: JSON.stringify({ chunks: [] }),
			partial: false,
			turn_complete: false,
			error_code: null,
			error_message: null,
			interrupted: false,
		});

		expect(event.content).toEqual({ parts: [{ text: "x" }] });
		expect(event.actions.stateDelta).toEqual({ k: 1 });
		expect(event.groundingMetadata).toEqual({ chunks: [] });
		expect(event.isFinalResponse()).toBe(false);
		expect(event.getFunctionCalls()).toEqual([]);
		expect(event.hasTrailingCodeExecutionResult()).toBe(false);
	});

	it("mergeState prefixes app and user keys onto session state", () => {
		expect(
			(service as any).mergeState(
				{ theme: "dark" },
				{ locale: "en" },
				{ local: 1 },
			),
		).toEqual({
			local: 1,
			[`${State.APP_PREFIX}theme`]: "dark",
			[`${State.USER_PREFIX}locale`]: "en",
		});

		expect((service as any).mergeState({}, {}, {})).toEqual({});
	});

	it("ensureInitialized is idempotent across repeated operations", async () => {
		const a = await service.createSession("app", "user", {}, "idem-1");
		const b = await service.getSession("app", "user", "idem-1");
		const listed = await service.listSessions("app", "user");
		expect(a.id).toBe("idem-1");
		expect(b?.id).toBe("idem-1");
		expect(listed.sessions.some((s) => s.id === "idem-1")).toBe(true);
	});

	it("storageEventToEvent restores turnComplete and interrupted from storage rows", () => {
		const event = (service as any).storageEventToEvent({
			id: "e-bools",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date(),
			content: JSON.stringify({ parts: [{ text: "done" }] }),
			actions: null,
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete: true,
			error_code: null,
			error_message: null,
			interrupted: true,
		});

		expect(event.turnComplete).toBe(true);
		expect(event.interrupted).toBe(true);
		expect(event.isFinalResponse()).toBe(true);
	});

	it("updateSession replaces stored session state wholesale", async () => {
		const created = await service.createSession(
			"app",
			"user",
			{ a: 1 },
			"s-upd",
		);
		await service.updateSession({
			...created,
			state: { replaced: true },
		});
		const fetched = await service.getSession("app", "user", "s-upd");
		expect(fetched?.state.replaced).toBe(true);
		expect(fetched?.state.a).toBeUndefined();
	});

	it("lists sessions for an app with no users as empty", async () => {
		expect(
			(await service.listSessions("brand-new-app", "nobody")).sessions,
		).toEqual([]);
	});

	it("rejects createSession when the session id already exists", async () => {
		await service.createSession("app", "user", {}, "dup-id");
		await expect(
			service.createSession("app", "user", { again: true }, "dup-id"),
		).rejects.toThrow();
	});

	it("rejects appendEvent when the storage session no longer exists", async () => {
		const session = await service.createSession("app", "user", {}, "gone");
		await service.deleteSession("app", "user", "gone");
		await expect(
			service.appendEvent(
				session,
				new Event({
					author: "agent",
					content: { role: "model", parts: [{ text: "late" }] },
				}),
			),
		).rejects.toThrow();
	});

	it("eventToStorageEvent coalesces falsy author and nullish actions", async () => {
		const session = await service.createSession("app", "user", {}, "s-falsy");
		const emptyAuthor = (service as any).eventToStorageEvent(session, {
			id: "e-empty-author",
			invocationId: "inv",
			author: "",
			content: { parts: [{ text: "x" }] },
			actions: undefined,
		});
		expect(emptyAuthor.author).toBe("");
		expect(emptyAuthor.actions).toBeNull();

		const nullActions = (service as any).eventToStorageEvent(session, {
			id: "e-null-actions",
			invocationId: "inv",
			author: undefined,
			content: null,
			actions: null,
		});
		expect(nullActions.author).toBe("");
		expect(nullActions.content).toBeNull();
		expect(nullActions.actions).toBeNull();

		const withActions = (service as any).eventToStorageEvent(session, {
			id: "e-with-actions",
			invocationId: "inv",
			author: "agent",
			content: { parts: [{ text: "y" }] },
			actions: new EventActions({ stateDelta: { k: 1 } }),
		});
		expect(withActions.author).toBe("agent");
		expect(JSON.parse(withActions.actions).stateDelta).toEqual({ k: 1 });
	});

	it("storageEventToEvent coalesces falsy functionCalls/functionResponses arrays", () => {
		const withNullBags = (service as any).storageEventToEvent({
			id: "e-null-bags",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date(),
			content: null,
			actions: JSON.stringify({
				functionCalls: null,
				functionResponses: null,
				hasTrailingCodeExecutionResult: null,
			}),
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
		});
		expect(withNullBags.getFunctionCalls()).toEqual([]);
		expect(withNullBags.getFunctionResponses()).toEqual([]);
		expect(withNullBags.hasTrailingCodeExecutionResult()).toBe(false);

		const withZeroishBags = (service as any).storageEventToEvent({
			id: "e-zeroish",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date(),
			content: null,
			actions: JSON.stringify({
				functionCalls: 0,
				functionResponses: "",
				hasTrailingCodeExecutionResult: false,
			}),
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
		});
		expect(withZeroishBags.getFunctionCalls()).toEqual([]);
		expect(withZeroishBags.getFunctionResponses()).toEqual([]);
		expect(withZeroishBags.hasTrailingCodeExecutionResult()).toBe(false);

		const withRealBags = (service as any).storageEventToEvent({
			id: "e-real-bags",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date(),
			content: null,
			actions: JSON.stringify({
				functionCalls: [{ name: "search", args: { q: 1 } }],
				functionResponses: [{ name: "search", response: { ok: true } }],
				hasTrailingCodeExecutionResult: true,
			}),
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
		});
		expect(withRealBags.getFunctionCalls()).toEqual([
			{ name: "search", args: { q: 1 } },
		]);
		expect(withRealBags.getFunctionResponses()).toEqual([
			{ name: "search", response: { ok: true } },
		]);
		expect(withRealBags.hasTrailingCodeExecutionResult()).toBe(true);
	});

	it("storageEventToEvent returns empty FC helpers when actions omit the keys", () => {
		const event = (service as any).storageEventToEvent({
			id: "e-no-fc-keys",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date(),
			content: null,
			actions: JSON.stringify({ stateDelta: {} }),
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
		});
		expect(event.getFunctionCalls()).toEqual([]);
		expect(event.getFunctionResponses()).toEqual([]);
		expect(event.hasTrailingCodeExecutionResult()).toBe(false);
	});

	it("appendEvent without stateDelta still persists the event row", async () => {
		const session = await service.createSession("app", "user", {}, "s-nostate");
		const before = await service.getSession("app", "user", "s-nostate");
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				content: { role: "model", parts: [{ text: "plain" }] },
			}),
		);
		const after = await service.getSession("app", "user", "s-nostate");
		expect(after?.events).toHaveLength(1);
		expect(after?.events[0].content?.parts?.[0]?.text).toBe("plain");
		expect(after?.state).toEqual(before?.state);
	});

	it("appendEvent with missing app/user state rows still persists session delta and event", async () => {
		const session = await service.createSession(
			"app-miss",
			"user-miss",
			{ [`${State.APP_PREFIX}a`]: 1, [`${State.USER_PREFIX}u`]: 2, local: 0 },
			"s-miss",
		);
		const db = (service as any).db;
		await db
			.deleteFrom("app_states")
			.where("app_name", "=", "app-miss")
			.execute();
		await db
			.deleteFrom("user_states")
			.where("app_name", "=", "app-miss")
			.where("user_id", "=", "user-miss")
			.execute();

		await expect(
			service.appendEvent(
				session,
				new Event({
					author: "agent",
					actions: new EventActions({
						stateDelta: {
							[`${State.APP_PREFIX}a`]: 9,
							[`${State.USER_PREFIX}u`]: 8,
							local: 7,
						},
					}),
					content: { role: "model", parts: [{ text: "recreate" }] },
				}),
			),
		).resolves.toBeTruthy();

		const fetched = await service.getSession("app-miss", "user-miss", "s-miss");
		expect(fetched?.events).toHaveLength(1);
		expect(fetched?.state.local).toBe(7);
		// updateTable on missing app/user rows is a no-op; prefixes are absent after delete
		expect(fetched?.state[`${State.APP_PREFIX}a`]).toBeUndefined();
		expect(fetched?.state[`${State.USER_PREFIX}u`]).toBeUndefined();
	});

	it("getSession recovers from corrupt JSON in session and event columns", async () => {
		const session = await service.createSession(
			"app",
			"user",
			{ ok: 1 },
			"s-bad",
		);
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				content: { role: "model", parts: [{ text: "good" }] },
			}),
		);
		const db = (service as any).db;
		await db
			.updateTable("sessions")
			.set({ state: "{not-json" })
			.where("app_name", "=", "app")
			.where("user_id", "=", "user")
			.where("id", "=", "s-bad")
			.execute();
		await db
			.updateTable("events")
			.set({
				content: "{bad",
				actions: "not-json",
				grounding_metadata: "{x",
				long_running_tool_ids_json: "nope",
			})
			.where("session_id", "=", "s-bad")
			.execute();

		const fetched = await service.getSession("app", "user", "s-bad");
		expect(fetched?.id).toBe("s-bad");
		expect(fetched?.events).toHaveLength(1);
		expect(fetched?.events[0].content).toBeNull();
		expect(fetched?.events[0].actions).toBeNull();
	});

	it("createSession generates unique ids under parallel creates without custom ids", async () => {
		const created = await Promise.all(
			Array.from({ length: 12 }, () =>
				service.createSession("app-par", "user-par", { n: 1 }),
			),
		);
		const ids = created.map((s) => s.id);
		expect(new Set(ids).size).toBe(12);
		const listed = await service.listSessions("app-par", "user-par");
		expect(listed.sessions).toHaveLength(12);
	});

	it("getSession numRecentEvents limits rows; afterTimestamp alone rejects on sqlite bind", async () => {
		const session = await service.createSession("app", "user", {}, "s-filter");
		for (const ts of [1000, 2000, 3000, 4000, 5000]) {
			await service.appendEvent(
				session,
				new Event({
					author: "agent",
					timestamp: ts,
					content: { role: "model", parts: [{ text: `t-${ts}` }] },
				}),
			);
		}

		const recent = await service.getSession("app", "user", "s-filter", {
			numRecentEvents: 2,
		});
		// sqlite LIMIT without ORDER BY returns earliest inserted rows; reverse restores chrono
		expect(recent?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"t-2000",
			"t-1000",
		]);
		expect(recent?.events).toHaveLength(2);

		await expect(
			service.getSession("app", "user", "s-filter", {
				numRecentEvents: 3,
				afterTimestamp: 2500,
			}),
		).rejects.toThrow(/SQLite3 can only bind/);
	});

	it("eventToStorageEvent serializes optional Event fields and clears them when absent", async () => {
		const session = await service.createSession("app", "user", {}, "s-opt");
		const fullEvent = new Event({
			id: "full",
			invocationId: "inv-full",
			author: "agent",
			branch: "main",
			content: { role: "model", parts: [{ text: "hi" }] },
			actions: new EventActions({ escalate: true }),
			longRunningToolIds: new Set(["t1", "t2"]),
			partial: true,
		});
		fullEvent.groundingMetadata = {
			searchEntryPoint: { renderedContent: "g" },
		} as any;
		fullEvent.turnComplete = false;
		fullEvent.errorCode = "E1";
		fullEvent.errorMessage = "oops";
		fullEvent.interrupted = true;

		const full = (service as any).eventToStorageEvent(session, fullEvent);
		expect(full.branch).toBe("main");
		expect(JSON.parse(full.long_running_tool_ids_json).sort()).toEqual([
			"t1",
			"t2",
		]);
		expect(JSON.parse(full.grounding_metadata).searchEntryPoint).toEqual({
			renderedContent: "g",
		});
		expect(full.partial).toBe(true);
		expect(full.error_code).toBe("E1");
		expect(full.interrupted).toBe(true);

		const sparse = (service as any).eventToStorageEvent(session, {
			id: "sparse",
			invocationId: undefined,
			author: "agent",
		});
		expect(sparse.invocation_id).toBe("");
		expect(sparse.branch).toBeNull();
		expect(sparse.long_running_tool_ids_json).toBeNull();
		expect(sparse.grounding_metadata).toBeNull();
		expect(sparse.partial).toBeNull();
		expect(sparse.turn_complete).toBeNull();
		expect(sparse.error_code).toBeNull();
		expect(sparse.error_message).toBeNull();
		expect(sparse.interrupted).toBeNull();
	});
});

describe("DatabaseSessionService leftover edges (post #124)", () => {
	let service: DatabaseSessionService;

	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		service = createSqliteSessionService(":memory:");
	});

	afterEach(async () => {
		vi.restoreAllMocks();
	});

	it("app-only stateDelta does not bump sessions.update_time for stale checks", async () => {
		const session = await service.createSession("app", "user", {}, "app-only");
		const before = session.lastUpdateTime;

		await service.appendEvent(
			session,
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "bump-app" }] },
				actions: new EventActions({
					stateDelta: { [`${State.APP_PREFIX}flag`]: "v1" },
				}),
			}),
		);

		expect(session.lastUpdateTime).toBe(before);
		expect(session.state[`${State.APP_PREFIX}flag`]).toBe("v1");

		await expect(
			service.appendEvent(
				session,
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "still-ok" }] },
				}),
			),
		).resolves.toBeDefined();
	});

	it("event-only append keeps equal update_time so a follow-up append succeeds", async () => {
		const session = await service.createSession("app", "user", {}, "evt-only");
		const first = await service.appendEvent(
			session,
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "one" }] },
			}),
		);
		const mid = session.lastUpdateTime;
		const second = await service.appendEvent(
			session,
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "two" }] },
			}),
		);
		expect(first).toBeDefined();
		expect(second).toBeDefined();
		expect(session.lastUpdateTime).toBe(mid);
	});

	it("parallel createSession during background init does not race schema setup", async () => {
		const Database = require("better-sqlite3");
		const { Kysely, SqliteDialect } = await import("kysely");
		const { DatabaseSessionService } = await import(
			"../../sessions/database-session-service"
		);
		const db = new Kysely({
			dialect: new SqliteDialect({
				database: new Database(":memory:"),
			}),
		});
		const racing = new DatabaseSessionService({ db });
		const [a, b] = await Promise.all([
			racing.createSession("app", "u1", { n: 1 }, "race-a"),
			racing.createSession("app", "u2", { n: 2 }, "race-b"),
		]);
		expect(a.id).toBe("race-a");
		expect(b.id).toBe("race-b");
		expect(await racing.getSession("app", "u1", "race-a")).toBeDefined();
		expect(await racing.getSession("app", "u2", "race-b")).toBeDefined();
	});
});
