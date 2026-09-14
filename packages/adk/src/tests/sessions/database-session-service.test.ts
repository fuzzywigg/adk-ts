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
		await new Promise((r) => setTimeout(r, 20));
		expect(errorSpy).toHaveBeenCalledWith(
			"Failed to initialize database:",
			expect.any(Error),
		);
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

	it("createSession with omitted state yields empty merged state", async () => {
		const created = await service.createSession("app", "user");
		expect(created.state).toEqual({});
		expect(created.events).toEqual([]);
		expect(created.id).toMatch(/^session-/);

		const fetched = await service.getSession("app", "user", created.id);
		expect(fetched?.state).toEqual({});
	});

	it("createSession with blank whitespace sessionId generates a session- id", async () => {
		const created = await service.createSession("app", "user", {}, "   ");
		expect(created.id).toMatch(/^session-/);
		expect(created.id.trim().length).toBeGreaterThan(0);
	});

	it("createSession with empty string sessionId generates a session- id", async () => {
		const created = await service.createSession("app", "user", { x: 1 }, "");
		expect(created.id).toMatch(/^session-/);
		expect(created.state.x).toBe(1);
	});

	it("appends app-only state deltas without touching session JSON keys", async () => {
		const session = await service.createSession(
			"app",
			"user",
			{},
			"s-app-only",
		);
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				actions: new EventActions({
					stateDelta: {
						[`${State.APP_PREFIX}flag`]: "on",
					},
				}),
			}),
		);

		const fetched = await service.getSession("app", "user", "s-app-only");
		expect(fetched?.state[`${State.APP_PREFIX}flag`]).toBe("on");
		expect(fetched?.state.flag).toBeUndefined();

		const sibling = await service.createSession("app", "user", {}, "s-sibling");
		expect(sibling.state[`${State.APP_PREFIX}flag`]).toBe("on");
	});

	it("appends user-only state deltas without session-local keys", async () => {
		const session = await service.createSession(
			"app",
			"user",
			{},
			"s-user-only",
		);
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				actions: new EventActions({
					stateDelta: {
						[`${State.USER_PREFIX}prefs`]: { a: 1 },
					},
				}),
			}),
		);

		const fetched = await service.getSession("app", "user", "s-user-only");
		expect(fetched?.state[`${State.USER_PREFIX}prefs`]).toEqual({ a: 1 });
	});

	it("eventToStorageEvent maps flags and defaults empty author/invocationId", () => {
		const session = {
			id: "s1",
			appName: "app",
			userId: "user",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};
		const flagged = new Event({
			content: { role: "model", parts: [{ text: "done" }] },
		});
		flagged.turnComplete = true;
		flagged.interrupted = true;
		const storedFlagged = (service as any).eventToStorageEvent(
			session,
			flagged,
		);
		expect(storedFlagged.turn_complete).toBe(true);
		expect(storedFlagged.interrupted).toBe(true);
		expect(storedFlagged.author).toBe("");
		expect(storedFlagged.invocation_id).toBe("");

		const named = new Event({
			author: "agent",
			invocationId: "inv-1",
		});
		const storedNamed = (service as any).eventToStorageEvent(session, named);
		expect(storedNamed.author).toBe("agent");
		expect(storedNamed.invocation_id).toBe("inv-1");
	});

	it("loads events whose stored actions JSON is an empty object", async () => {
		const emptyActions = (service as any).storageEventToEvent({
			id: "e-empty-actions",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date(),
			content: JSON.stringify({ parts: [{ text: "x" }] }),
			actions: "{}",
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
		});

		expect(emptyActions.getFunctionCalls()).toEqual([]);
		expect(emptyActions.getFunctionResponses()).toEqual([]);
		expect(emptyActions.hasTrailingCodeExecutionResult()).toBe(false);
		expect(emptyActions.isFinalResponse()).toBe(false);
	});

	it("storageEventToEvent uses parseJsonSafely defaults for corrupt columns", () => {
		const broken = (service as any).storageEventToEvent({
			id: "e-bad",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date(),
			content: "{not-json",
			actions: "{also-bad",
			long_running_tool_ids_json: "not-array",
			grounding_metadata: "{nope",
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
		});

		expect(broken.content).toBeNull();
		expect(broken.actions).toBeNull();
		expect(Array.from(broken.longRunningToolIds ?? [])).toEqual([]);
		expect(broken.groundingMetadata).toBeNull();
	});

	it("eventToStorageEvent nulls absent longRunningToolIds and groundingMetadata", () => {
		const session = {
			id: "s1",
			appName: "app",
			userId: "user",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};
		const sparse = new Event({
			author: "agent",
			content: { parts: [{ text: "hi" }] },
		});
		const stored = (service as any).eventToStorageEvent(session, sparse);
		expect(stored.long_running_tool_ids_json).toBeNull();
		expect(stored.grounding_metadata).toBeNull();
		expect(JSON.parse(stored.actions)).toMatchObject({
			stateDelta: {},
			artifactDelta: {},
		});
		expect(stored.content).toBe(JSON.stringify(sparse.content));

		const emptySet = new Event({
			author: "agent",
			longRunningToolIds: new Set(),
		});
		const storedEmpty = (service as any).eventToStorageEvent(session, emptySet);
		expect(storedEmpty.long_running_tool_ids_json).toBe("[]");
	});

	it("updateSessionState assigns null/undefined instead of deleting keys", () => {
		const session = {
			id: "s",
			appName: "app",
			userId: "user",
			state: { keep: 1, remove: 2 },
			events: [],
			lastUpdateTime: 0,
		};
		(service as any).updateSessionState(session, {
			actions: {
				stateDelta: {
					remove: null,
					also: undefined,
					[`${State.TEMP_PREFIX}skip`]: "nope",
				},
			},
		});
		expect(session.state.remove).toBeNull();
		expect(session.state.also).toBeUndefined();
		expect(session.state.keep).toBe(1);
		expect(session.state[`${State.TEMP_PREFIX}skip`]).toBeUndefined();
	});

	it("updateSessionState no-ops on empty stateDelta object", () => {
		const session = {
			id: "s",
			appName: "app",
			userId: "user",
			state: { keep: 1 },
			events: [],
			lastUpdateTime: 0,
		};
		(service as any).updateSessionState(session, {
			actions: { stateDelta: {} },
		});
		expect(session.state).toEqual({ keep: 1 });
	});

	it("getSession tolerates missing app_states and user_states rows", async () => {
		const created = await service.createSession(
			"app",
			"user",
			{ local: true },
			"s-orphan-states",
		);
		await (service as any).db
			.deleteFrom("app_states")
			.where("app_name", "=", "app")
			.execute();
		await (service as any).db
			.deleteFrom("user_states")
			.where("app_name", "=", "app")
			.where("user_id", "=", "user")
			.execute();

		const fetched = await service.getSession("app", "user", "s-orphan-states");
		expect(fetched?.id).toBe(created.id);
		expect(fetched?.state.local).toBe(true);
	});

	it("getSession recovers from corrupt JSON in state columns", async () => {
		await service.createSession("app", "user", { ok: 1 }, "s-corrupt");
		await (service as any).db
			.updateTable("sessions")
			.set({ state: "{bad-json" })
			.where("id", "=", "s-corrupt")
			.execute();
		await (service as any).db
			.updateTable("app_states")
			.set({ state: "not-json" })
			.where("app_name", "=", "app")
			.execute();

		const fetched = await service.getSession("app", "user", "s-corrupt");
		expect(fetched?.id).toBe("s-corrupt");
		expect(fetched?.state).toEqual({});
	});

	it("appendEvent without session-state delta keeps lastUpdateTime from storage", async () => {
		const session = await service.createSession("app", "user", {}, "s-ts-hold");
		const before = session.lastUpdateTime;

		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				content: { parts: [{ text: "no-delta" }] },
			}),
		);
		expect(session.lastUpdateTime).toBeGreaterThanOrEqual(before);

		const afterFirst = session.lastUpdateTime;
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				content: { parts: [{ text: "still-no-delta" }] },
			}),
		);
		expect(session.lastUpdateTime).toBeGreaterThanOrEqual(afterFirst);

		const fetched = await service.getSession("app", "user", "s-ts-hold");
		expect(fetched?.events).toHaveLength(2);
	});

	it("skipTableCreation with broken schema rejects on first operation", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { DatabaseSessionService } = await import(
			"../../sessions/database-session-service"
		);
		const db = {
			schema: {
				createTable: () => ({
					ifNotExists: () => ({
						addColumn: () => {
							throw new Error("deferred boom");
						},
					}),
				}),
			},
		};
		const deferred = new DatabaseSessionService({
			db: db as any,
			skipTableCreation: true,
		});

		await expect(
			deferred.createSession("app", "user", {}, "s1"),
		).rejects.toThrow(/deferred boom/);
		expect(errorSpy).toHaveBeenCalledWith(
			"Error initializing database:",
			expect.any(Error),
		);
	});

	it("createSession with only empty app/user deltas still inserts state rows", async () => {
		const created = await service.createSession(
			"fresh-app",
			"fresh-user",
			{},
			"s-empty-deltas",
		);
		expect(created.state).toEqual({});

		const appRow = await (service as any).db
			.selectFrom("app_states")
			.selectAll()
			.where("app_name", "=", "fresh-app")
			.executeTakeFirst();
		const userRow = await (service as any).db
			.selectFrom("user_states")
			.selectAll()
			.where("app_name", "=", "fresh-app")
			.where("user_id", "=", "fresh-user")
			.executeTakeFirst();

		expect(appRow).toBeDefined();
		expect(userRow).toBeDefined();
		expect(JSON.parse(appRow.state)).toEqual({});
		expect(JSON.parse(userRow.state)).toEqual({});
	});

	it("actions helpers return empty when functionCalls keys are missing", () => {
		const event = (service as any).storageEventToEvent({
			id: "e-no-fc",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date(),
			content: null,
			actions: JSON.stringify({ transferToAgent: "x" }),
			long_running_tool_ids_json: "[]",
			grounding_metadata: null,
			partial: false,
			turn_complete: false,
			error_code: null,
			error_message: null,
			interrupted: false,
		});
		expect(event.getFunctionCalls()).toEqual([]);
		expect(event.getFunctionResponses()).toEqual([]);
		expect(event.hasTrailingCodeExecutionResult()).toBe(false);
		expect(event.isFinalResponse()).toBe(false);
		expect(Array.from(event.longRunningToolIds ?? [])).toEqual([]);
	});

	it("listSessions returns lastUpdateTime from storage timestamps", async () => {
		await service.createSession("app", "user", {}, "s-list-a");
		await service.createSession("app", "user", {}, "s-list-b");
		const listed = await service.listSessions("app", "user");
		expect(listed.sessions).toHaveLength(2);
		for (const s of listed.sessions) {
			expect(s.lastUpdateTime).toBeGreaterThan(0);
			expect(s.events).toEqual([]);
			expect(s.state).toEqual({});
		}
	});
});
