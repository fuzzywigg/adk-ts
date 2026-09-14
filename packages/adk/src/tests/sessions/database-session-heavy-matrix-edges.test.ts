import { beforeEach, describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { DatabaseSessionService } from "../../sessions/database-session-service";
import { State } from "../../sessions/state";

/**
 * DatabaseSessionService helper/contract matrices.
 * Asymmetry vs InMemory: DB extractStateDelta drops State.TEMP_PREFIX (temp:),
 * while BaseSessionService / InMemory skip only temp_ underscore keys.
 */
describe("DatabaseSessionService heavy matrix edges", () => {
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

	it("parseJsonSafely matrix: nullish and empty string fall back", () => {
		const parse = (service as any).parseJsonSafely.bind(service);
		expect(parse(null, "d")).toBe("d");
		expect(parse(undefined, 7)).toBe(7);
		expect(parse("", [])).toEqual([]);
	});

	it("parseJsonSafely matrix: invalid JSON returns fallback", () => {
		const parse = (service as any).parseJsonSafely.bind(service);
		expect(parse("{", "fb")).toBe("fb");
		expect(parse("[1,", null)).toBeNull();
		expect(parse("undefined", 0)).toBe(0);
	});

	it("parseJsonSafely matrix: typed JSON literals", () => {
		const parse = (service as any).parseJsonSafely.bind(service);
		expect(parse("null", {})).toBeNull();
		expect(parse("true", false)).toBe(true);
		expect(parse("false", true)).toBe(false);
		expect(parse("0", 1)).toBe(0);
		expect(parse('"hi"', "")).toBe("hi");
		expect(parse("[1,2]", [])).toEqual([1, 2]);
		expect(parse('{"a":1}', {})).toEqual({ a: 1 });
	});

	it("timestampToUnixSeconds matrix: Date and ISO string", () => {
		const toUnix = (service as any).timestampToUnixSeconds.bind(service);
		const date = new Date("2021-01-01T00:00:00.000Z");
		expect(toUnix(date)).toBe(date.getTime() / 1000);
		expect(toUnix("2021-01-01T00:00:00.000Z")).toBe(date.getTime() / 1000);
	});

	it("timestampToUnixSeconds matrix: seconds vs milliseconds heuristic", () => {
		const toUnix = (service as any).timestampToUnixSeconds.bind(service);
		expect(toUnix(1_600_000_000)).toBe(1_600_000_000);
		expect(toUnix(1_600_000_000_000)).toBe(1_600_000_000);
		expect(toUnix(10_000_000_001)).toBeCloseTo(10_000_000_001 / 1000);
	});

	it("timestampToUnixSeconds matrix: null/weird fall back to now", () => {
		const toUnix = (service as any).timestampToUnixSeconds.bind(service);
		const before = Date.now() / 1000;
		const a = toUnix(null);
		const b = toUnix({ weird: true });
		const after = Date.now() / 1000;
		expect(a).toBeGreaterThanOrEqual(before - 1);
		expect(b).toBeLessThanOrEqual(after + 1);
	});

	it("generateSessionId yields unique session- prefixes", () => {
		const ids = new Set(
			Array.from({ length: 30 }, () => (service as any).generateSessionId()),
		);
		expect(ids.size).toBe(30);
		for (const id of ids) {
			expect(id).toMatch(/^session-/);
		}
	});

	it("extractStateDelta drops TEMP_PREFIX (temp:) — DB asymmetry vs InMemory temp_", () => {
		const extract = (service as any).extractStateDelta.bind(service);
		const result = extract({
			[`${State.TEMP_PREFIX}scratch`]: "tmp",
			temp_also: "kept-as-session",
			[`${State.APP_PREFIX}theme`]: "dark",
			[`${State.USER_PREFIX}locale`]: "en",
			local: "x",
		});
		expect(result).toEqual({
			appStateDelta: { theme: "dark" },
			userStateDelta: { locale: "en" },
			sessionStateDelta: { temp_also: "kept-as-session", local: "x" },
		});
	});

	it("extractStateDelta treats undefined as empty buckets", () => {
		const extract = (service as any).extractStateDelta.bind(service);
		expect(extract(undefined)).toEqual({
			appStateDelta: {},
			userStateDelta: {},
			sessionStateDelta: {},
		});
	});

	it("extractStateDelta with only TEMP keys yields empty buckets", () => {
		const extract = (service as any).extractStateDelta.bind(service);
		expect(
			extract({
				[`${State.TEMP_PREFIX}a`]: 1,
				[`${State.TEMP_PREFIX}b`]: 2,
			}),
		).toEqual({
			appStateDelta: {},
			userStateDelta: {},
			sessionStateDelta: {},
		});
	});

	it("mergeState re-prefixes app and user maps", () => {
		const merge = (service as any).mergeState.bind(service);
		expect(merge({ a: 1 }, { b: 2 }, { local: 3 })).toEqual({
			local: 3,
			[`${State.APP_PREFIX}a`]: 1,
			[`${State.USER_PREFIX}b`]: 2,
		});
	});

	it("mergeState with empty maps returns session state only", () => {
		const merge = (service as any).mergeState.bind(service);
		expect(merge({}, {}, { x: 1 })).toEqual({ x: 1 });
		expect(merge({}, {}, {})).toEqual({});
	});

	it("createSession trims ids and generates for whitespace-only", async () => {
		const trimmed = await service.createSession("app", "user", {}, "  keep  ");
		expect(trimmed.id).toBe("keep");
		const generated = await service.createSession("app", "user", {}, "   ");
		expect(generated.id).toMatch(/^session-/);
	});

	it("createSession drops TEMP_PREFIX from initial state", async () => {
		const session = await service.createSession("app", "user", {
			[`${State.TEMP_PREFIX}scratch`]: "ignored",
			keep: 1,
			[`${State.APP_PREFIX}theme`]: "dark",
		});
		expect(session.state[`${State.TEMP_PREFIX}scratch`]).toBeUndefined();
		expect(session.state.keep).toBe(1);
		expect(session.state[`${State.APP_PREFIX}theme`]).toBe("dark");
	});

	it("appendEvent merges app/user/session state and skips TEMP_PREFIX", async () => {
		const session = await service.createSession("app", "user", {}, "evt");
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				actions: new EventActions({
					stateDelta: {
						[`${State.APP_PREFIX}flag`]: true,
						[`${State.USER_PREFIX}locale`]: "fr",
						local: "x",
						[`${State.TEMP_PREFIX}tmp`]: "nope",
					},
				}),
			}),
		);
		const fetched = await service.getSession("app", "user", "evt");
		expect(fetched?.state[`${State.APP_PREFIX}flag`]).toBe(true);
		expect(fetched?.state[`${State.USER_PREFIX}locale`]).toBe("fr");
		expect(fetched?.state.local).toBe("x");
		expect(fetched?.state[`${State.TEMP_PREFIX}tmp`]).toBeUndefined();
	});

	it("appendEvent round-trips content and longRunningToolIds", async () => {
		const session = await service.createSession("app", "user", {}, "evt2");
		const event = new Event({
			author: "agent",
			invocationId: "inv",
			content: { role: "model", parts: [{ text: "hi" }] },
			longRunningToolIds: new Set(["t1", "t2"]),
		});
		await service.appendEvent(session, event);
		const fetched = await service.getSession("app", "user", "evt2");
		expect(fetched?.events[0].content).toEqual({
			role: "model",
			parts: [{ text: "hi" }],
		});
		expect(
			Array.from(fetched?.events[0].longRunningToolIds ?? []).sort(),
		).toEqual(["t1", "t2"]);
	});

	it("skips partial events without persisting them", async () => {
		const session = await service.createSession("app", "user", {}, "partial");
		await service.appendEvent(
			session,
			new Event({
				author: "agent",
				partial: true,
				content: { parts: [{ text: "stream" }] },
			}),
		);
		expect(
			(await service.getSession("app", "user", "partial"))?.events,
		).toEqual([]);
	});

	it("listSessions is empty for unknown app/user pairs", async () => {
		await service.createSession("app", "user", {}, "s1");
		expect((await service.listSessions("other", "user")).sessions).toEqual([]);
		expect((await service.listSessions("app", "other")).sessions).toEqual([]);
	});

	it("deleteSession is idempotent for missing ids", async () => {
		await expect(
			service.deleteSession("app", "user", "missing"),
		).resolves.toBeUndefined();
	});

	it("getSession returns undefined for unknown session id", async () => {
		await service.createSession("app", "user", {}, "exists");
		expect(await service.getSession("app", "user", "missing")).toBeUndefined();
	});

	it("numRecentEvents limits returned events", async () => {
		const session = await service.createSession("app", "user", {}, "nr");
		for (const text of ["a", "b", "c"]) {
			await service.appendEvent(
				session,
				new Event({ author: "user", content: { parts: [{ text }] } }),
			);
		}
		const recent = await service.getSession("app", "user", "nr", {
			numRecentEvents: 2,
		});
		expect(recent?.events).toHaveLength(2);
	});

	it("storageEventToEvent recovers corrupt JSON via defaults", () => {
		const convert = (service as any).storageEventToEvent.bind(service);
		const event = convert({
			id: "e1",
			invocation_id: "inv",
			author: "agent",
			timestamp: new Date("2024-01-01T00:00:00.000Z"),
			content: "{bad",
			actions: "{bad",
			long_running_tool_ids_json: "{bad",
			grounding_metadata: "{bad",
			partial: null,
			turn_complete: null,
			error_code: null,
			error_message: null,
			interrupted: null,
			branch: null,
		});
		expect(event.content).toBeNull();
		expect(event.actions).toBeNull();
		expect(event.longRunningToolIds).toEqual(new Set());
		expect(event.groundingMetadata).toBeNull();
	});

	it("storageEventToEvent parses valid JSON content and actions", () => {
		const convert = (service as any).storageEventToEvent.bind(service);
		const event = convert({
			id: "e2",
			invocation_id: "inv2",
			author: "user",
			timestamp: new Date("2024-06-01T00:00:00.000Z"),
			content: JSON.stringify({ role: "user", parts: [{ text: "ok" }] }),
			actions: JSON.stringify({ stateDelta: { a: 1 } }),
			long_running_tool_ids_json: JSON.stringify(["x"]),
			grounding_metadata: JSON.stringify({ chunks: [] }),
			partial: false,
			turn_complete: true,
			error_code: null,
			error_message: null,
			interrupted: false,
			branch: "root",
		});
		expect(event.content).toEqual({ role: "user", parts: [{ text: "ok" }] });
		expect(event.actions?.stateDelta).toEqual({ a: 1 });
		expect(Array.from(event.longRunningToolIds ?? [])).toEqual(["x"]);
		expect(event.branch).toBe("root");
	});

	it("updateSession persists session-level state changes", async () => {
		const created = await service.createSession("app", "user", { a: 1 }, "upd");
		await service.updateSession({ ...created, state: { a: 2, b: 3 } });
		const updated = await service.getSession("app", "user", "upd");
		expect(updated?.state.a).toBe(2);
		expect(updated?.state.b).toBe(3);
	});

	it("rejects stale session appends when lastUpdateTime is behind storage", async () => {
		const session = await service.createSession("app", "user", {}, "stale");
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

	it("createSession without state yields empty merged session state", async () => {
		const session = await service.createSession("app", "user");
		expect(session.state).toEqual({});
		expect(session.events).toEqual([]);
	});

	it("listSessions strips events/state on listed copies", async () => {
		const session = await service.createSession(
			"app",
			"user",
			{ a: 1 },
			"strip",
		);
		await service.appendEvent(
			session,
			new Event({ author: "user", content: { parts: [{ text: "hi" }] } }),
		);
		const listed = await service.listSessions("app", "user");
		expect(listed.sessions[0].events).toEqual([]);
		expect(listed.sessions[0].state).toEqual({});
	});

	it("app state from one session appears on sibling createSession", async () => {
		const first = await service.createSession("app", "user", {}, "sib-a");
		await service.appendEvent(
			first,
			new Event({
				author: "agent",
				actions: new EventActions({
					stateDelta: { [`${State.APP_PREFIX}shared`]: "yes" },
				}),
			}),
		);
		const second = await service.createSession("app", "user", {}, "sib-b");
		expect(second.state[`${State.APP_PREFIX}shared`]).toBe("yes");
	});

	it("user state does not leak across users", async () => {
		const u1 = await service.createSession("app", "u1", {}, "s1");
		await service.appendEvent(
			u1,
			new Event({
				author: "agent",
				actions: new EventActions({
					stateDelta: { [`${State.USER_PREFIX}secret`]: "u1" },
				}),
			}),
		);
		const u2 = await service.createSession("app", "u2", {}, "s2");
		expect(u2.state[`${State.USER_PREFIX}secret`]).toBeUndefined();
	});

	it("deleteSession removes session from list and get", async () => {
		await service.createSession("app", "user", {}, "del");
		await service.deleteSession("app", "user", "del");
		expect(await service.getSession("app", "user", "del")).toBeUndefined();
		expect((await service.listSessions("app", "user")).sessions).toEqual([]);
	});
});
