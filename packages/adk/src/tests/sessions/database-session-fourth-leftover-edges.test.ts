import { beforeEach, describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { DatabaseSessionService } from "../../sessions/database-session-service";
import { State } from "../../sessions/state";

describe("DatabaseSessionService fourth leftover matrices (mocked sqlite)", () => {
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

	it("createSession generates session- ids and drops TEMP_PREFIX", async () => {
		const session = await service.createSession("app", "user", {
			keep: 1,
			[`${State.TEMP_PREFIX}scratch`]: "ignored",
			[`${State.APP_PREFIX}theme`]: "dark",
			[`${State.USER_PREFIX}locale`]: "en",
		});
		expect(session.id).toMatch(/^session-/);
		expect(session.state.keep).toBe(1);
		expect(session.state[`${State.TEMP_PREFIX}scratch`]).toBeUndefined();
		expect(session.state[`${State.APP_PREFIX}theme`]).toBe("dark");
		expect(session.state[`${State.USER_PREFIX}locale`]).toBe("en");
		expect(session.events).toEqual([]);
	});

	it("createSession with custom id and whitespace trim", async () => {
		const custom = await service.createSession(
			"app",
			"user",
			{ a: 1 },
			"custom-4th",
		);
		expect(custom.id).toBe("custom-4th");
		const trimmed = await service.createSession("app", "user", {}, "  keep  ");
		expect(trimmed.id).toBe("keep");
		const generated = await service.createSession("app", "user", {}, "   ");
		expect(generated.id).toMatch(/^session-/);
	});

	it("get/list/update/delete round-trip", async () => {
		const created = await service.createSession("app", "user", { a: 1 }, "s1");
		expect((await service.getSession("app", "user", "s1"))?.state.a).toBe(1);
		expect(await service.getSession("app", "user", "missing")).toBeUndefined();

		const listed = await service.listSessions("app", "user");
		expect(listed.sessions.map((s) => s.id)).toEqual(["s1"]);
		expect(listed.sessions[0].events).toEqual([]);
		expect(listed.sessions[0].state).toEqual({});

		await service.updateSession({ ...created, state: { a: 2, b: 3 } });
		const updated = await service.getSession("app", "user", "s1");
		expect(updated?.state.a).toBe(2);
		expect(updated?.state.b).toBe(3);

		await service.deleteSession("app", "user", "s1");
		expect(await service.getSession("app", "user", "s1")).toBeUndefined();
		expect((await service.listSessions("app", "user")).sessions).toEqual([]);
	});

	it("listSessions empty for unknown users/apps", async () => {
		await service.createSession("app", "user-a", {}, "s1");
		expect((await service.listSessions("app", "user-b")).sessions).toEqual([]);
		expect((await service.listSessions("other", "user-a")).sessions).toEqual(
			[],
		);
	});

	it("deleteSession is idempotent for missing ids", async () => {
		await expect(
			service.deleteSession("app", "user", "missing"),
		).resolves.toBeUndefined();
	});

	it("appendEvent merges app/user/session and drops TEMP_PREFIX", async () => {
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
			invocationId: "inv-4",
			branch: "root.child",
			content: { role: "model", parts: [{ text: "hello" }] },
			longRunningToolIds: new Set(["t1"]),
		});
		await service.appendEvent(session, event);
		const fetched = await service.getSession("app", "user", "evt2");
		expect(fetched?.events).toHaveLength(1);
		expect(fetched?.events[0].author).toBe("agent");
		expect(fetched?.events[0].invocationId).toBe("inv-4");
		expect(fetched?.events[0].branch).toBe("root.child");
		expect(fetched?.events[0].content).toEqual({
			role: "model",
			parts: [{ text: "hello" }],
		});
		expect(Array.from(fetched?.events[0].longRunningToolIds ?? [])).toEqual([
			"t1",
		]);
	});

	it("skips partial events without persisting", async () => {
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

	it("numRecentEvents limits returned events", async () => {
		const session = await service.createSession("app", "user", {}, "nr");
		for (const text of ["a", "b", "c", "d"]) {
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

	it("rejects stale session appends", async () => {
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

	const parseMatrix: Array<{
		input: unknown;
		fallback: unknown;
		expected: unknown;
	}> = [
		{ input: null, fallback: "d", expected: "d" },
		{ input: undefined, fallback: 7, expected: 7 },
		{ input: "", fallback: [], expected: [] },
		{ input: "{", fallback: "fb", expected: "fb" },
		{ input: "null", fallback: {}, expected: null },
		{ input: "true", fallback: false, expected: true },
		{ input: "false", fallback: true, expected: false },
		{ input: "0", fallback: 1, expected: 0 },
		{ input: '"hi"', fallback: "", expected: "hi" },
		{ input: "[1,2]", fallback: [], expected: [1, 2] },
		{ input: '{"a":1}', fallback: {}, expected: { a: 1 } },
	];

	for (const { input, fallback, expected } of parseMatrix) {
		it(`parseJsonSafely ${JSON.stringify(input)}`, () => {
			const parse = (service as any).parseJsonSafely.bind(service);
			expect(parse(input, fallback)).toEqual(expected);
		});
	}

	it("extractStateDelta matrix drops TEMP and buckets prefixes", () => {
		const extract = (service as any).extractStateDelta.bind(service);
		expect(
			extract({
				[`${State.TEMP_PREFIX}scratch`]: "tmp",
				temp_also: "kept",
				[`${State.APP_PREFIX}theme`]: "dark",
				[`${State.USER_PREFIX}locale`]: "en",
				local: "x",
			}),
		).toEqual({
			appStateDelta: { theme: "dark" },
			userStateDelta: { locale: "en" },
			sessionStateDelta: { temp_also: "kept", local: "x" },
		});
		expect(extract(undefined)).toEqual({
			appStateDelta: {},
			userStateDelta: {},
			sessionStateDelta: {},
		});
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
		expect(merge({}, {}, { x: 1 })).toEqual({ x: 1 });
		expect(merge({}, {}, {})).toEqual({});
	});

	it("timestampToUnixSeconds matrix", () => {
		const toUnix = (service as any).timestampToUnixSeconds.bind(service);
		const date = new Date("2021-01-01T00:00:00.000Z");
		expect(toUnix(date)).toBe(date.getTime() / 1000);
		expect(toUnix("2021-01-01T00:00:00.000Z")).toBe(date.getTime() / 1000);
		expect(toUnix(1_600_000_000)).toBe(1_600_000_000);
		expect(toUnix(1_600_000_000_000)).toBe(1_600_000_000);
	});

	it("generateSessionId yields unique session- prefixes", () => {
		const ids = new Set(
			Array.from({ length: 20 }, () => (service as any).generateSessionId()),
		);
		expect(ids.size).toBe(20);
		for (const id of ids) {
			expect(id).toMatch(/^session-/);
		}
	});

	it("storageEventToEvent recovers corrupt JSON via defaults", () => {
		const convert = (service as any).storageEventToEvent.bind(service);
		const event = convert({
			id: "e1",
			invocation_id: "inv",
			author: "agent",
			branch: null,
			timestamp: new Date("2020-01-01T00:00:00.000Z"),
			content: "{",
			actions: "not-json",
			long_running_tool_ids: null,
			partial: 0,
			turn_complete: 1,
			error_code: null,
			error_message: null,
			interrupted: 0,
		});
		expect(event.id).toBe("e1");
		expect(event.author).toBe("agent");
		expect(event.invocationId).toBe("inv");
	});

	it("multiple sessions for same user list without events", async () => {
		await service.createSession("app", "user", {}, "a");
		await service.createSession("app", "user", {}, "b");
		const listed = await service.listSessions("app", "user");
		expect(listed.sessions.map((s) => s.id).sort()).toEqual(["a", "b"]);
		for (const s of listed.sessions) {
			expect(s.events).toEqual([]);
			expect(s.state).toEqual({});
		}
	});
});
