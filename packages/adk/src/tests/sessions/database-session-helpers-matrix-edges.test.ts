import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";
import { State } from "../../sessions/state";

describe("DatabaseSessionService helper matrix edges", () => {
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

	it("parseJsonSafely covers nullish, invalid, and typed JSON payloads", () => {
		const parse = (service as any).parseJsonSafely.bind(service);
		expect(parse(null, ["d"])).toEqual(["d"]);
		expect(parse(undefined, ["d"])).toEqual(["d"]);
		expect(parse("", 0)).toBe(0);
		expect(parse("{", "fb")).toBe("fb");
		expect(parse("null", { x: 1 })).toBeNull();
		expect(parse("[]", null)).toEqual([]);
		expect(parse("true", false)).toBe(true);
		expect(parse("123", 0)).toBe(123);
		expect(parse('{"a":1}', {})).toEqual({ a: 1 });
	});

	it("timestampToUnixSeconds covers Date, string, seconds, ms, and fallback", () => {
		const toUnix = (service as any).timestampToUnixSeconds.bind(service);
		const date = new Date("2020-06-15T12:00:00.000Z");
		expect(toUnix(date)).toBe(date.getTime() / 1000);
		expect(toUnix("2020-06-15T12:00:00.000Z")).toBe(date.getTime() / 1000);
		expect(toUnix(1_000_000_000)).toBe(1_000_000_000);
		expect(toUnix(10_000_000_001)).toBeCloseTo(10_000_000_001 / 1000);
		expect(toUnix(1_590_000_000_000)).toBe(1_590_000_000);
		const before = Date.now() / 1000;
		const fallback = toUnix({ weird: true });
		const after = Date.now() / 1000;
		expect(fallback).toBeGreaterThanOrEqual(before - 1);
		expect(fallback).toBeLessThanOrEqual(after + 1);
		expect(toUnix(null)).toBeGreaterThan(0);
	});

	it("generateSessionId yields unique session-prefixed ids", () => {
		const ids = new Set(
			Array.from({ length: 25 }, () => (service as any).generateSessionId()),
		);
		expect(ids.size).toBe(25);
		for (const id of ids) {
			expect(id).toMatch(/^session-/);
		}
	});

	it("extractStateDelta strips prefixes and drops TEMP keys", () => {
		const extract = (service as any).extractStateDelta.bind(service);
		expect(extract(undefined)).toEqual({
			appStateDelta: {},
			userStateDelta: {},
			sessionStateDelta: {},
		});
		expect(
			extract({
				[`${State.APP_PREFIX}theme`]: "dark",
				[`${State.USER_PREFIX}locale`]: "en",
				[`${State.TEMP_PREFIX}scratch`]: "tmp",
				local: "session",
			}),
		).toEqual({
			appStateDelta: { theme: "dark" },
			userStateDelta: { locale: "en" },
			sessionStateDelta: { local: "session" },
		});
	});

	it("mergeState re-prefixes app and user maps onto session state", () => {
		const merge = (service as any).mergeState.bind(service);
		expect(merge({ a: 1 }, { b: 2 }, { local: 3 })).toEqual({
			local: 3,
			[`${State.APP_PREFIX}a`]: 1,
			[`${State.USER_PREFIX}b`]: 2,
		});
		expect(merge({}, {}, {})).toEqual({});
	});

	it("createSession trims ids and treats whitespace-only as generated", async () => {
		const trimmed = await service.createSession(
			"app",
			"user",
			{ x: 1 },
			"  keep-me  ",
		);
		expect(trimmed.id).toBe("keep-me");
		const generated = await service.createSession("app", "user", {}, "   ");
		expect(generated.id).toMatch(/^session-/);
	});

	it("appendEvent round-trips content and merges app/session state", async () => {
		const session = await service.createSession("app", "user", {}, "evt");
		await service.appendEvent(session, {
			id: "e1",
			author: "agent",
			timestamp: 1_700_000_000,
			content: { role: "model", parts: [{ text: "hi" }] },
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}flag`]: true,
					local: "x",
				},
			},
		} as any);
		const fetched = await service.getSession("app", "user", "evt");
		expect(fetched?.events).toHaveLength(1);
		expect(fetched?.events[0].content).toEqual({
			role: "model",
			parts: [{ text: "hi" }],
		});
		expect(fetched?.state[`${State.APP_PREFIX}flag`]).toBe(true);
		expect(fetched?.state.local).toBe("x");
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

	it("storageEventToEvent recovers corrupt JSON via parseJsonSafely defaults", () => {
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

	it("getSession returns undefined for unknown session id", async () => {
		await service.createSession("app", "user", {}, "exists");
		expect(await service.getSession("app", "user", "missing")).toBeUndefined();
	});

	it("createSession without state yields empty merged session state", async () => {
		const session = await service.createSession("app", "user");
		expect(session.state).toEqual({});
		expect(session.events).toEqual([]);
	});
});
