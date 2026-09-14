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

	it("generates a session id when the provided id is only whitespace", async () => {
		const created = await service.createSession("app", "user", {}, "   ");
		expect(created.id).toMatch(/^session-/);
		expect(await service.getSession("app", "user", created.id)).toBeDefined();
	});

	it("createSession without state still seeds empty app/user rows", async () => {
		const created = await service.createSession("app-empty", "user-empty");
		expect(created.state).toEqual({});
		const again = await service.createSession(
			"app-empty",
			"user-empty",
			{
				[`${State.USER_PREFIX}locale`]: "de",
			},
			"second",
		);
		expect(again.state[`${State.USER_PREFIX}locale`]).toBe("de");
	});

	it("isolates app and user state across different apps", async () => {
		await service.createSession(
			"app-a",
			"shared-user",
			{ [`${State.APP_PREFIX}theme`]: "a", local: 1 },
			"s1",
		);
		const b = await service.createSession(
			"app-b",
			"shared-user",
			{ [`${State.APP_PREFIX}theme`]: "b", local: 2 },
			"s1",
		);

		expect(b.state[`${State.APP_PREFIX}theme`]).toBe("b");
		expect(b.state.local).toBe(2);
		const a = await service.getSession("app-a", "shared-user", "s1");
		expect(a?.state[`${State.APP_PREFIX}theme`]).toBe("a");
		expect(a?.state.local).toBe(1);
	});

	it("appendEvent with only app-prefixed deltas updates shared app state", async () => {
		const session = await service.createSession("app", "user", {}, "s-app");
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				actions: new EventActions({
					stateDelta: { [`${State.APP_PREFIX}flag`]: "on" },
				}),
			}),
		);

		const sibling = await service.createSession("app", "user", {}, "s-sib");
		expect(sibling.state[`${State.APP_PREFIX}flag`]).toBe("on");
	});

	it("appendEvent with only user-prefixed deltas updates shared user state", async () => {
		const session = await service.createSession("app", "user", {}, "s-user");
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				actions: new EventActions({
					stateDelta: { [`${State.USER_PREFIX}plan`]: "pro" },
				}),
			}),
		);

		const other = await service.createSession("app", "user", {}, "s-other");
		expect(other.state[`${State.USER_PREFIX}plan`]).toBe("pro");
	});

	it("appendEvent with empty stateDelta still persists the event", async () => {
		const session = await service.createSession(
			"app",
			"user",
			{},
			"s-empty-delta",
		);
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				content: { role: "model", parts: [{ text: "noop" }] },
				actions: new EventActions({ stateDelta: {} }),
			}),
		);

		const fetched = await service.getSession("app", "user", "s-empty-delta");
		expect(fetched?.events).toHaveLength(1);
		expect(fetched?.events[0].content?.parts?.[0]).toEqual({ text: "noop" });
		expect(fetched?.state).toEqual({});
	});

	it("appendEvent mutates the in-memory session events list", async () => {
		const session = await service.createSession("app", "user", {}, "s-mem");
		const event = new Event({
			author: "agent",
			content: { parts: [{ text: "live" }] },
		});
		await service.appendEvent(session, event);
		expect(session.events).toHaveLength(1);
		expect(session.events[0].id).toBe(event.id);
		expect(session.lastUpdateTime).toBeGreaterThan(0);
	});

	it("maps interrupted/turnComplete helpers and empty longRunningToolIds in storage conversion", () => {
		const withFlags = (service as any).storageEventToEvent({
			id: "e-flags",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date(),
			content: JSON.stringify({ parts: [{ text: "flags" }] }),
			actions: null,
			long_running_tool_ids_json: JSON.stringify([]),
			grounding_metadata: null,
			partial: null,
			turn_complete: true,
			error_code: null,
			error_message: null,
			interrupted: true,
		});
		expect(withFlags.interrupted).toBe(true);
		expect(withFlags.turnComplete).toBe(true);
		expect(withFlags.isFinalResponse()).toBe(true);
		expect(Array.from(withFlags.longRunningToolIds ?? [])).toEqual([]);

		const session = {
			id: "s1",
			appName: "app",
			userId: "user",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};
		const storage = (service as any).eventToStorageEvent(
			session,
			new Event({
				author: "agent",
				longRunningToolIds: new Set(),
			}),
		);
		expect(storage.long_running_tool_ids_json).toBe("[]");
	});

	it("updateSession replaces session-local state for subsequent gets", async () => {
		const created = await service.createSession(
			"app",
			"user",
			{ counter: 1 },
			"s-upd",
		);
		await service.updateSession({
			...created,
			state: { counter: 9, extra: "yes" },
		});
		const fetched = await service.getSession("app", "user", "s-upd");
		expect(fetched?.state.counter).toBe(9);
		expect(fetched?.state.extra).toBe("yes");
	});

	it("listSessions always returns empty state and events shells", async () => {
		const session = await service.createSession(
			"app",
			"user",
			{ filled: true },
			"s-list",
		);
		await service.appendEvent(
			session,
			new Event({ author: "agent", content: { parts: [{ text: "x" }] } }),
		);

		const listed = await service.listSessions("app", "user");
		const row = listed.sessions.find((s) => s.id === "s-list");
		expect(row?.state).toEqual({});
		expect(row?.events).toEqual([]);
		expect(row?.lastUpdateTime).toBeGreaterThan(0);
	});

	it("eventToStorageEvent nulls optional fields when absent", () => {
		const session = {
			id: "s1",
			appName: "app",
			userId: "user",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};
		const storage = (service as any).eventToStorageEvent(
			session,
			new Event({ author: "agent" }),
		);
		expect(storage.content).toBeNull();
		expect(JSON.parse(storage.actions)).toMatchObject({
			stateDelta: {},
			artifactDelta: {},
		});
		expect(storage.branch).toBeNull();
		expect(storage.long_running_tool_ids_json).toBeNull();
		expect(storage.grounding_metadata).toBeNull();
		expect(storage.partial).toBeNull();
		expect(storage.turn_complete).toBeNull();
		expect(storage.error_code).toBeNull();
		expect(storage.error_message).toBeNull();
		expect(storage.interrupted).toBeNull();
		expect(storage.invocation_id).toBe("");
	});

	it("storageEventToEvent falls back on corrupt JSON blobs", () => {
		const event = (service as any).storageEventToEvent({
			id: "e-bad",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: "b",
			timestamp: new Date("2024-06-01T00:00:00.000Z"),
			content: "{not-json",
			actions: "{also-bad",
			long_running_tool_ids_json: "not-an-array",
			grounding_metadata: "{nope",
			partial: false,
			turn_complete: false,
			error_code: "E",
			error_message: "m",
			interrupted: false,
		});

		expect(event.content).toBeNull();
		expect(event.actions).toBeNull();
		expect(event.groundingMetadata).toBeNull();
		expect(Array.from(event.longRunningToolIds ?? [])).toEqual([]);
		expect(event.getFunctionCalls()).toEqual([]);
		expect(event.getFunctionResponses()).toEqual([]);
		expect(event.hasTrailingCodeExecutionResult()).toBe(false);
		expect(event.branch).toBe("b");
		expect(event.errorCode).toBe("E");
	});

	it("storageEventToEvent treats empty action bags as no function traffic", () => {
		const event = (service as any).storageEventToEvent({
			id: "e-empty-actions",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date(),
			content: null,
			actions: JSON.stringify({}),
			long_running_tool_ids_json: JSON.stringify(["a", "b"]),
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
		expect(Array.from(event.longRunningToolIds ?? [])).toEqual(["a", "b"]);
	});

	it("extractStateDelta ignores temp keys and splits prefixes", () => {
		expect((service as any).extractStateDelta(undefined)).toEqual({
			appStateDelta: {},
			userStateDelta: {},
			sessionStateDelta: {},
		});
		expect(
			(service as any).extractStateDelta({
				[`${State.APP_PREFIX}a`]: 1,
				[`${State.USER_PREFIX}b`]: 2,
				[`${State.TEMP_PREFIX}c`]: 3,
				session: 4,
			}),
		).toEqual({
			appStateDelta: { a: 1 },
			userStateDelta: { b: 2 },
			sessionStateDelta: { session: 4 },
		});
	});

	it("mergeState prefixes app and user keys onto session state", () => {
		expect(
			(service as any).mergeState(
				{ theme: "dark" },
				{ locale: "en" },
				{
					local: true,
				},
			),
		).toEqual({
			local: true,
			[`${State.APP_PREFIX}theme`]: "dark",
			[`${State.USER_PREFIX}locale`]: "en",
		});
	});

	it("generateSessionId returns unique session-prefixed ids", () => {
		const ids = new Set(
			Array.from({ length: 20 }, () => (service as any).generateSessionId()),
		);
		expect(ids.size).toBe(20);
		for (const id of ids) {
			expect(id).toMatch(/^session-\d+-[a-z0-9]+$/);
		}
	});

	it("ensureInitialized rethrows initializeDatabase failures", async () => {
		const { DatabaseSessionService } = await import(
			"../../sessions/database-session-service"
		);
		const boom = new Error("schema boom");
		const db = {
			schema: {
				createTable: () => ({
					ifNotExists: () => ({
						addColumn: () => {
							throw boom;
						},
					}),
				}),
			},
		};
		const broken = new DatabaseSessionService({
			db: db as any,
			skipTableCreation: true,
		});
		await expect(broken.createSession("app", "user")).rejects.toThrow(
			"schema boom",
		);
	});

	it("appends multiple events and returns all of them from getSession", async () => {
		const session = await service.createSession("app", "user", {}, "s-order");
		for (const text of ["first", "second", "third"]) {
			await service.appendEvent(
				session,
				new Event({
					author: "agent",
					content: { parts: [{ text }] },
				}),
			);
		}
		const fetched = await service.getSession("app", "user", "s-order");
		const texts =
			fetched?.events.map((e) => e.content?.parts?.[0]?.text as string) ?? [];
		expect(texts).toHaveLength(3);
		expect(texts.sort()).toEqual(["first", "second", "third"]);
	});

	it("createSession with only TEMP keys stores no session-local state", async () => {
		const created = await service.createSession(
			"app",
			"user",
			{ [`${State.TEMP_PREFIX}scratch`]: "gone" },
			"s-temp-only",
		);
		expect(created.state).toEqual({});
		const fetched = await service.getSession("app", "user", "s-temp-only");
		expect(fetched?.state).toEqual({});
	});

	it("partial append does not advance lastUpdateTime or session events", async () => {
		const session = await service.createSession("app", "user", {}, "s-partial");
		const before = session.lastUpdateTime;
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				partial: true,
				content: { parts: [{ text: "stream" }] },
			}),
		);
		expect(session.events).toEqual([]);
		expect(session.lastUpdateTime).toBe(before);
	});

	it("round-trips functionCall content parts", async () => {
		const session = await service.createSession("app", "user", {}, "s-fc");
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				content: {
					role: "model",
					parts: [
						{
							functionCall: { id: "c1", name: "search", args: { q: "adk" } },
						},
					],
				},
			}),
		);
		const fetched = await service.getSession("app", "user", "s-fc");
		expect(fetched?.events[0].content?.parts?.[0]?.functionCall).toEqual({
			id: "c1",
			name: "search",
			args: { q: "adk" },
		});
	});

	it("rejects append when session row is missing mid-flight", async () => {
		const session = await service.createSession("app", "user", {}, "s-gone");
		await service.deleteSession("app", "user", "s-gone");
		await expect(
			service.appendEvent(
				session,
				new Event({ author: "agent", content: { parts: [{ text: "x" }] } }),
			),
		).rejects.toThrow();
	});

	it("numRecentEvents of 1 returns a single event from the session", async () => {
		const session = await service.createSession("app", "user", {}, "s-one");
		await service.appendEvent(
			session,
			new Event({ author: "user", content: { parts: [{ text: "old" }] } }),
		);
		await service.appendEvent(
			session,
			new Event({ author: "agent", content: { parts: [{ text: "new" }] } }),
		);
		const recent = await service.getSession("app", "user", "s-one", {
			numRecentEvents: 1,
		});
		expect(recent?.events).toHaveLength(1);
		expect(["old", "new"]).toContain(
			recent?.events[0].content?.parts?.[0]?.text,
		);
	});
});
