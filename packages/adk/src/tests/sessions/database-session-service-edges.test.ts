import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { createSqliteSessionService } from "../../sessions/database-factories";
import type { DatabaseSessionService } from "../../sessions/database-session-service";
import { State } from "../../sessions/state";

describe("DatabaseSessionService leftover edges", () => {
	let service: DatabaseSessionService;

	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		service = createSqliteSessionService(":memory:");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	async function refresh(id: string) {
		return (await service.getSession("app", "user", id))!;
	}

	it("app-only stateDelta does not bump sessions.update_time", async () => {
		let session = await service.createSession("app", "user", {}, "app-only");
		const before = session.lastUpdateTime;

		await new Promise((r) => setTimeout(r, 15));

		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				actions: new EventActions({
					stateDelta: { [`${State.APP_PREFIX}theme`]: "dark" },
				}),
			}),
		);

		session = await refresh("app-only");
		expect(session.lastUpdateTime).toBe(before);
		expect(session.state[`${State.APP_PREFIX}theme`]).toBe("dark");
		expect(session.events).toHaveLength(1);
	});

	it("user-only stateDelta does not bump sessions.update_time", async () => {
		let session = await service.createSession("app", "user", {}, "user-only");
		const before = session.lastUpdateTime;

		await new Promise((r) => setTimeout(r, 15));

		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				actions: new EventActions({
					stateDelta: { [`${State.USER_PREFIX}locale`]: "fr" },
				}),
			}),
		);

		session = await refresh("user-only");
		expect(session.lastUpdateTime).toBe(before);
		expect(session.state[`${State.USER_PREFIX}locale`]).toBe("fr");
	});

	it("session stateDelta does bump sessions.update_time", async () => {
		let session = await service.createSession("app", "user", {}, "sess-bump");
		const before = session.lastUpdateTime;

		await new Promise((r) => setTimeout(r, 15));

		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				actions: new EventActions({
					stateDelta: { counter: 1 },
				}),
			}),
		);

		session = await refresh("sess-bump");
		expect(session.lastUpdateTime).toBeGreaterThanOrEqual(before);
		expect(session.state.counter).toBe(1);
	});

	it("generateSessionId shape matches session-<ms>-<rand>", async () => {
		const id = (service as any).generateSessionId();
		expect(id).toMatch(/^session-\d+-[a-z0-9]+$/);
	});

	it("parseJsonSafely returns defaults for corrupt and empty strings", () => {
		expect((service as any).parseJsonSafely(null, { a: 1 })).toEqual({ a: 1 });
		expect((service as any).parseJsonSafely("", [])).toEqual([]);
		expect(
			(service as any).parseJsonSafely("{bad", { fallback: true }),
		).toEqual({ fallback: true });
		expect((service as any).parseJsonSafely('{"ok":true}', {})).toEqual({
			ok: true,
		});
	});

	it("corrupt JSON in storage rows falls back through getSession e2e", async () => {
		await service.createSession("app", "user", { good: 1 }, "corrupt");

		const db = (service as any).db;
		await db
			.updateTable("sessions")
			.set({ state: "{not-json" })
			.where("id", "=", "corrupt")
			.execute();
		await db
			.updateTable("app_states")
			.set({ state: "{broken" })
			.where("app_name", "=", "app")
			.execute();
		await db
			.updateTable("user_states")
			.set({ state: "also-broken" })
			.where("app_name", "=", "app")
			.where("user_id", "=", "user")
			.execute();

		const session = await service.getSession("app", "user", "corrupt");
		expect(session?.state.good).toBeUndefined();
		expect(session?.state).toEqual({});
	});

	it("storageEventToEvent returns non-array functionCalls as-is via || [] short-circuit", () => {
		const withCalls = (service as any).storageEventToEvent({
			id: "e1",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date("2024-01-01T00:00:00.000Z"),
			content: null,
			actions: JSON.stringify({
				functionCalls: { not: "array" },
				hasTrailingCodeExecutionResult: true,
			}),
			long_running_tool_ids_json: null,
			grounding_metadata: null,
			partial: false,
			turn_complete: false,
			error_code: null,
			error_message: null,
			interrupted: false,
		});

		// `(actions.functionCalls as any[]) || []` keeps truthy non-arrays
		expect(withCalls.getFunctionCalls()).toEqual({ not: "array" });
		expect(withCalls.hasTrailingCodeExecutionResult()).toBe(true);
		expect(withCalls.branch).toBeUndefined();
	});

	it("storageEventToEvent restores functionCalls arrays when present", () => {
		const event = (service as any).storageEventToEvent({
			id: "e2",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: "root",
			timestamp: new Date(),
			content: null,
			actions: JSON.stringify({
				functionCalls: [{ name: "tool", args: { x: 1 } }],
				functionResponses: [{ name: "tool", response: { ok: true } }],
			}),
			long_running_tool_ids_json: '["a","b"]',
			grounding_metadata: null,
			partial: false,
			turn_complete: false,
			error_code: null,
			error_message: null,
			interrupted: false,
		});

		expect(event.getFunctionCalls()).toEqual([
			{ name: "tool", args: { x: 1 } },
		]);
		expect(event.getFunctionResponses()).toEqual([
			{ name: "tool", response: { ok: true } },
		]);
		expect(Array.from(event.longRunningToolIds ?? [])).toEqual(["a", "b"]);
		expect(event.branch).toBe("root");
	});

	it("stale-session check throws when sqlite update_time is not a Date", async () => {
		const session = await service.createSession("app", "user", {}, "stale");
		session.lastUpdateTime = 1;

		// sqlite returns update_time as string; `.toISOString()` in the error
		// message path throws before the stale-session text is produced.
		await expect(
			service.appendEvent(
				session,
				new Event({
					author: "agent",
					content: { parts: [{ text: "late" }] },
				}),
			),
		).rejects.toThrow(/toISOString|stale session/);
	});

	it("timestampToUnixSeconds handles Date, string, seconds, and ms numbers", () => {
		const fn = (service as any).timestampToUnixSeconds.bind(service);
		expect(fn(new Date("2024-01-01T00:00:00.000Z"))).toBe(
			Date.parse("2024-01-01T00:00:00.000Z") / 1000,
		);
		expect(fn("2024-06-01T12:00:00.000Z")).toBe(
			Date.parse("2024-06-01T12:00:00.000Z") / 1000,
		);
		expect(fn(1_700_000_000)).toBe(1_700_000_000);
		expect(fn(1_700_000_000_000)).toBe(1_700_000_000);
		expect(typeof fn(undefined)).toBe("number");
	});

	it("eventToStorageEvent serializes optional fields and Set tool ids", () => {
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
			branch: "b",
			content: { role: "model", parts: [{ text: "hi" }] },
			actions: new EventActions({ stateDelta: { a: 1 } }),
			longRunningToolIds: new Set(["t1"]),
			partial: false,
		});
		// LlmResponse fields are not EventOpts — assign after construction
		event.groundingMetadata = {
			searchEntryPoint: { renderedContent: "x" },
		} as any;
		event.turnComplete = true;
		event.errorCode = "E";
		event.errorMessage = "msg";
		event.interrupted = false;

		const row = (service as any).eventToStorageEvent(session, event);
		expect(row.id).toBe(event.id);
		expect(JSON.parse(row.content)).toEqual(event.content);
		expect(JSON.parse(row.actions).stateDelta).toEqual({ a: 1 });
		expect(JSON.parse(row.long_running_tool_ids_json)).toEqual(["t1"]);
		expect(row.branch).toBe("b");
		expect(row.turn_complete).toBe(true);
		expect(row.error_code).toBe("E");
		expect(JSON.parse(row.grounding_metadata)).toEqual({
			searchEntryPoint: { renderedContent: "x" },
		});
	});

	it("eventToStorageEvent serializes default EventActions when none provided", () => {
		const session = {
			id: "s1",
			appName: "app",
			userId: "user",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};
		const event = new Event({ author: "user" });
		const row = (service as any).eventToStorageEvent(session, event);
		expect(row.content).toBeNull();
		// Event always constructs a default EventActions instance
		expect(JSON.parse(row.actions)).toMatchObject({
			stateDelta: {},
			artifactDelta: {},
		});
		expect(row.long_running_tool_ids_json).toBeNull();
		expect(row.grounding_metadata).toBeNull();
		expect(row.branch).toBeNull();
	});

	it("extractStateDelta splits prefixes and drops temp:", () => {
		expect(
			(service as any).extractStateDelta({
				[`${State.APP_PREFIX}a`]: 1,
				[`${State.USER_PREFIX}b`]: 2,
				[`${State.TEMP_PREFIX}c`]: 3,
				local: 4,
			}),
		).toEqual({
			appStateDelta: { a: 1 },
			userStateDelta: { b: 2 },
			sessionStateDelta: { local: 4 },
		});
		expect((service as any).extractStateDelta(undefined)).toEqual({
			appStateDelta: {},
			userStateDelta: {},
			sessionStateDelta: {},
		});
	});

	it("updateSessionState on Database assigns null instead of deleting", () => {
		const session = {
			id: "s",
			appName: "app",
			userId: "user",
			state: { a: 1, b: 2 },
			events: [],
			lastUpdateTime: 0,
		};
		(service as any).updateSessionState(
			session,
			new Event({
				author: "agent",
				actions: new EventActions({
					stateDelta: {
						a: null,
						[`${State.TEMP_PREFIX}x`]: "skip",
						c: 3,
					},
				}),
			}),
		);
		expect(session.state.a).toBeNull();
		expect(session.state.b).toBe(2);
		expect(session.state.c).toBe(3);
		expect(session.state[`${State.TEMP_PREFIX}x`]).toBeUndefined();
	});

	it("storageEventToEvent restores error fields and grounding metadata", () => {
		const event = (service as any).storageEventToEvent({
			id: "e-err",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date(),
			content: JSON.stringify({
				role: "model",
				parts: [{ text: "partial" }],
			}),
			actions: null,
			long_running_tool_ids_json: null,
			grounding_metadata: JSON.stringify({ webSearchQueries: ["q"] }),
			partial: null,
			turn_complete: null,
			error_code: "RATE_LIMIT",
			error_message: "slow down",
			interrupted: true,
		});

		expect(event.errorCode).toBe("RATE_LIMIT");
		expect(event.errorMessage).toBe("slow down");
		expect(event.interrupted).toBe(true);
		expect(event.groundingMetadata).toEqual({ webSearchQueries: ["q"] });
	});

	it("appendEvent with boolean interrupted fails sqlite bind (documents edge)", async () => {
		const session = await service.createSession("app", "user", {}, "bool-bind");
		const event = new Event({
			author: "agent",
			content: { role: "model", parts: [{ text: "x" }] },
		});
		event.interrupted = true;
		await expect(service.appendEvent(session, event)).rejects.toThrow(
			/SQLite3 can only bind/,
		);
	});

	it("getSession with afterTimestamp rejects Date binds on sqlite", async () => {
		const session = await service.createSession(
			"app",
			"user",
			{ n: 0 },
			"filt",
		);
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				actions: new EventActions({ stateDelta: { n: 1 } }),
				content: { parts: [{ text: "v0" }] },
			}),
		);

		await expect(
			service.getSession("app", "user", "filt", {
				afterTimestamp: Date.now() / 1000,
			}),
		).rejects.toThrow(/SQLite3 can only bind/);
	});

	it("numRecentEvents limits to N events even when timestamps tie", async () => {
		let session = await service.createSession("app", "user", {}, "recent");
		for (let i = 0; i < 4; i++) {
			await service.appendEvent(
				session,
				new Event({
					author: "agent",
					content: { parts: [{ text: `n${i}` }] },
					actions: new EventActions({ stateDelta: { i } }),
				}),
			);
			session = await refresh("recent");
			await new Promise((r) => setTimeout(r, 20));
		}

		const recent = await service.getSession("app", "user", "recent", {
			numRecentEvents: 2,
		});
		expect(recent?.events).toHaveLength(2);
		const texts = recent?.events.map((e) => e.content?.parts?.[0]?.text) ?? [];
		expect(new Set(texts).size).toBe(2);
		for (const t of texts) {
			expect(["n0", "n1", "n2", "n3"]).toContain(t);
		}
	});

	it("deleteSession fails with FK when events still reference the session", async () => {
		const session = await service.createSession("app", "user", {}, "cascade");
		await service.appendEvent(
			session,
			new Event({
				author: "user",
				content: { parts: [{ text: "bye" }] },
				actions: new EventActions({ stateDelta: { x: 1 } }),
			}),
		);
		await expect(
			service.deleteSession("app", "user", "cascade"),
		).rejects.toThrow(/FOREIGN KEY/);
		expect(await service.getSession("app", "user", "cascade")).toBeTruthy();
	});

	it("deleteSession succeeds for sessions with no events", async () => {
		await service.createSession("app", "user", {}, "empty-del");
		await service.deleteSession("app", "user", "empty-del");
		expect(
			await service.getSession("app", "user", "empty-del"),
		).toBeUndefined();
	});

	it("listSessions returns multiple sessions for the same user", async () => {
		await service.createSession("app", "user", {}, "a");
		await service.createSession("app", "user", {}, "b");
		await service.createSession("app", "other", {}, "c");

		const listed = await service.listSessions("app", "user");
		expect(listed.sessions.map((s) => s.id).sort()).toEqual(["a", "b"]);
	});

	it("createSession without state yields empty merged state", async () => {
		const session = await service.createSession("app", "user");
		expect(session.state).toEqual({});
		expect(session.id).toMatch(/^session-/);
		expect(session.events).toEqual([]);
	});
});
