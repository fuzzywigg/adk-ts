import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSessionService } from "../../sessions/database-session-service";
import { State } from "../../sessions/state";

describe("DatabaseSessionService helper leftover edges", () => {
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

	it("parseJsonSafely matrix covers nullish, invalid, and valid payloads", () => {
		const parse = (service as any).parseJsonSafely.bind(service);
		expect(parse(null, ["default"])).toEqual(["default"]);
		expect(parse(undefined, ["default"])).toEqual(["default"]);
		expect(parse("", 0)).toBe(0);
		expect(parse("null", { x: 1 })).toBeNull();
		expect(parse("[]", null)).toEqual([]);
		expect(parse('{"a":1}', {})).toEqual({ a: 1 });
		expect(parse("{", "fallback")).toBe("fallback");
		expect(parse("undefined", "fallback")).toBe("fallback");
		expect(parse("true", false)).toBe(true);
		expect(parse("123", 0)).toBe(123);
	});

	it("timestampToUnixSeconds matrix covers Date, string, seconds, ms, and fallback", () => {
		const toUnix = (service as any).timestampToUnixSeconds.bind(service);
		const date = new Date("2020-06-15T12:00:00.000Z");
		expect(toUnix(date)).toBe(date.getTime() / 1000);
		expect(toUnix("2020-06-15T12:00:00.000Z")).toBe(date.getTime() / 1000);
		expect(toUnix(1_000_000_000)).toBe(1_000_000_000);
		expect(toUnix(10_000_000_000)).toBe(10_000_000_000);
		expect(toUnix(10_000_000_001)).toBe(10_000_000_001 / 1000);
		expect(toUnix(1_590_000_000_000)).toBe(1_590_000_000);
		const before = Date.now() / 1000;
		const fallback = toUnix(null);
		const after = Date.now() / 1000;
		expect(fallback).toBeGreaterThanOrEqual(before);
		expect(fallback).toBeLessThanOrEqual(after);
		expect(toUnix(false)).toBeGreaterThan(0);
		expect(toUnix([])).toBeGreaterThan(0);
	});

	it("generateSessionId produces unique session-prefixed ids", () => {
		const ids = new Set(
			Array.from({ length: 20 }, () => (service as any).generateSessionId()),
		);
		expect(ids.size).toBe(20);
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
		expect(extract({})).toEqual({
			appStateDelta: {},
			userStateDelta: {},
			sessionStateDelta: {},
		});
		const split = extract({
			[`${State.APP_PREFIX}theme`]: "dark",
			[`${State.USER_PREFIX}locale`]: "en",
			[`${State.TEMP_PREFIX}scratch`]: "tmp",
			local: "session-only",
		});
		expect(split).toEqual({
			appStateDelta: { theme: "dark" },
			userStateDelta: { locale: "en" },
			sessionStateDelta: { local: "session-only" },
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

	it("createSession with whitespace-only id falls back to generated id", async () => {
		const created = await service.createSession("app", "user", {}, "   ");
		expect(created.id).toMatch(/^session-/);
		expect(created.id.trim().length).toBeGreaterThan(0);
	});

	it("createSession trims provided ids before persistence", async () => {
		const created = await service.createSession(
			"app",
			"user",
			{ x: 1 },
			"  trimmed-id  ",
		);
		expect(created.id).toBe("trimmed-id");
		const fetched = await service.getSession("app", "user", "trimmed-id");
		expect(fetched?.state.x).toBe(1);
	});

	it("appendEvent persists content/actions JSON and round-trips via getSession", async () => {
		const session = await service.createSession("app", "user", {}, "evt-1");
		const ts = 1_700_000_000;
		await service.appendEvent(session, {
			id: "event-1",
			author: "agent",
			timestamp: ts,
			content: { role: "model", parts: [{ text: "hi" }] },
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}flag`]: true,
					local: "x",
				},
			},
		} as any);

		const fetched = await service.getSession("app", "user", "evt-1");
		expect(fetched?.events).toHaveLength(1);
		expect(fetched?.events[0].content).toEqual({
			role: "model",
			parts: [{ text: "hi" }],
		});
		expect(fetched?.state[`${State.APP_PREFIX}flag`]).toBe(true);
		expect(fetched?.state.local).toBe("x");
	});

	it("listSessions returns empty for unknown app/user pairs", async () => {
		await service.createSession("app", "user", {}, "s1");
		const listed = await service.listSessions("other", "user");
		expect(listed.sessions).toEqual([]);
	});

	it("deleteSession is idempotent for missing sessions", async () => {
		await expect(
			service.deleteSession("app", "user", "missing"),
		).resolves.toBeUndefined();
	});

	it("getSession returns undefined for unknown session id", async () => {
		await service.createSession("app", "user", {}, "exists");
		expect(await service.getSession("app", "user", "missing")).toBeUndefined();
	});

	it("storageEventToEvent recovers corrupt JSON fields via parseJsonSafely defaults", () => {
		const convert = (service as any).storageEventToEvent.bind(service);
		const event = convert({
			id: "e1",
			invocation_id: "inv-1",
			app_name: "app",
			user_id: "user",
			session_id: "s1",
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
		expect(event.longRunningToolIds).toEqual(new Set([]));
		expect(event.groundingMetadata).toBeNull();
	});
});
