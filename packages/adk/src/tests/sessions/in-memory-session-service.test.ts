import { describe, expect, it, vi } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { State } from "../../sessions/state";

describe("InMemorySessionService", () => {
	it("creates sessions with generated or custom ids", async () => {
		const service = new InMemorySessionService();
		const generated = await service.createSession("app", "user", { a: 1 });
		expect(generated.id).toBeTruthy();
		expect(generated.appName).toBe("app");
		expect(generated.userId).toBe("user");
		expect(generated.state).toEqual({ a: 1 });

		const custom = await service.createSession(
			"app",
			"user",
			{ b: 2 },
			"custom-id",
		);
		expect(custom.id).toBe("custom-id");
	});

	it("gets, lists, and deletes sessions", async () => {
		const service = new InMemorySessionService();
		const created = await service.createSession("app", "user", {}, "s1");

		const fetched = await service.getSession("app", "user", "s1");
		expect(fetched?.id).toBe("s1");
		expect(await service.getSession("app", "user", "missing")).toBeUndefined();

		const listed = await service.listSessions("app", "user");
		expect(listed.sessions.map((s) => s.id)).toEqual(["s1"]);
		expect(listed.sessions[0].events).toEqual([]);
		expect(listed.sessions[0].state).toEqual({});

		await service.deleteSession("app", "user", created.id);
		expect(await service.getSession("app", "user", "s1")).toBeUndefined();
	});

	it("merges app and user state from event deltas", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");

		await service.appendEvent(session, {
			author: "agent",
			timestamp: Date.now() / 1000,
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}theme`]: "dark",
					[`${State.USER_PREFIX}locale`]: "en",
					local: "session-only",
				},
			},
		} as any);

		const fetched = await service.getSession("app", "user", "s1");
		expect(fetched?.state[`${State.APP_PREFIX}theme`]).toBe("dark");
		expect(fetched?.state[`${State.USER_PREFIX}locale`]).toBe("en");
	});

	it("appends multiple events to a session", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		const base = Date.now() / 1000;

		await service.appendEvent(session, {
			author: "user",
			timestamp: base,
			content: { parts: [{ text: "one" }] },
		} as any);
		await service.appendEvent(session, {
			author: "agent",
			timestamp: base + 1,
			content: { parts: [{ text: "two" }] },
		} as any);
		await service.appendEvent(session, {
			author: "user",
			timestamp: base + 2,
			content: { parts: [{ text: "three" }] },
		} as any);

		const fetched = await service.getSession("app", "user", "s1");
		expect(fetched?.events).toHaveLength(3);
		expect(fetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"one",
			"two",
			"three",
		]);
	});

	it("lists empty sessions for an unknown user", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user-a", {}, "s1");

		const listed = await service.listSessions("app", "user-b");
		expect(listed.sessions).toEqual([]);
	});

	it("getSession respects numRecentEvents and afterTimestamp config", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		const t0 = 1000;
		const t1 = 2000;
		const t2 = 3000;

		await service.appendEvent(session, {
			author: "user",
			timestamp: t0,
			content: { parts: [{ text: "a" }] },
		} as any);
		await service.appendEvent(session, {
			author: "agent",
			timestamp: t1,
			content: { parts: [{ text: "b" }] },
		} as any);
		await service.appendEvent(session, {
			author: "user",
			timestamp: t2,
			content: { parts: [{ text: "c" }] },
		} as any);

		const recent = await service.getSession("app", "user", "s1", {
			numRecentEvents: 2,
		});
		expect(recent?.events).toHaveLength(2);
		expect(recent?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"b",
			"c",
		]);

		const after = await service.getSession("app", "user", "s1", {
			afterTimestamp: 1500,
		});
		expect(after?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"b",
			"c",
		]);
	});

	it("creates concurrent sessions with different ids", async () => {
		const service = new InMemorySessionService();
		const [a, b, c] = await Promise.all([
			service.createSession("app", "user"),
			service.createSession("app", "user"),
			service.createSession("app", "user"),
		]);

		const ids = new Set([a.id, b.id, c.id]);
		expect(ids.size).toBe(3);

		const listed = await service.listSessions("app", "user");
		expect(listed.sessions).toHaveLength(3);
	});

	it("mirrors CRUD through deprecated sync APIs", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = new InMemorySessionService();

		const created = service.createSessionSync(
			"app",
			"user",
			{ a: 1 },
			"sync-1",
		);
		expect(created.id).toBe("sync-1");
		expect(service.getSessionSync("app", "user", "sync-1")?.state.a).toBe(1);
		expect(service.listSessionsSync("app", "user").sessions).toHaveLength(1);

		service.deleteSessionSync("app", "user", "sync-1");
		expect(service.getSessionSync("app", "user", "sync-1")).toBeUndefined();
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("warns when appending to an unknown storage session", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = new InMemorySessionService();
		const orphan = {
			appName: "missing-app",
			userId: "user",
			id: "s1",
			state: {},
			events: [],
			lastUpdateTime: Date.now() / 1000,
		};

		await service.appendEvent(
			orphan as any,
			{
				author: "user",
				timestamp: Date.now() / 1000,
				content: { parts: [{ text: "orphan" }] },
			} as any,
		);

		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("appName missing-app not in sessions"),
		);
		warn.mockRestore();
	});

	it("generates a UUID when sessionId is blank or whitespace", async () => {
		const service = new InMemorySessionService();
		const blank = await service.createSession("app", "user", {}, "   ");
		expect(blank.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		);

		const empty = await service.createSession("app", "user", {}, "");
		expect(empty.id).toBeTruthy();
		expect(empty.id).not.toBe("   ");
	});

	it("deleteSession is a no-op for unknown sessions", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "keep");
		await expect(
			service.deleteSession("app", "user", "missing"),
		).resolves.toBeUndefined();
		expect(await service.getSession("app", "user", "keep")).toBeTruthy();
		expect(await service.listSessions("missing-app", "user")).toEqual({
			sessions: [],
		});
	});

	it("warns for missing userId and sessionId when appending", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = new InMemorySessionService();
		await service.createSession("app", "user-a", {}, "s1");

		await service.appendEvent(
			{
				appName: "app",
				userId: "other-user",
				id: "s1",
				state: {},
				events: [],
				lastUpdateTime: 1,
			} as any,
			{
				author: "user",
				timestamp: 2,
				content: { parts: [{ text: "no-user" }] },
			} as any,
		);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("userId other-user not in sessions[appName]"),
		);

		warn.mockClear();
		await service.appendEvent(
			{
				appName: "app",
				userId: "user-a",
				id: "missing-session",
				state: {},
				events: [],
				lastUpdateTime: 1,
			} as any,
			{
				author: "user",
				timestamp: 3,
				content: { parts: [{ text: "no-session" }] },
			} as any,
		);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(
				"sessionId missing-session not in sessions[appName][userId]",
			),
		);
		warn.mockRestore();
	});

	it("merges app-state-only deltas without user state", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");

		await service.appendEvent(session, {
			author: "agent",
			timestamp: 10,
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}feature`]: "on",
					localOnly: "session",
				},
			},
		} as any);

		const fetched = await service.getSession("app", "user", "s1");
		expect(fetched?.state[`${State.APP_PREFIX}feature`]).toBe("on");
		expect(fetched?.state.localOnly).toBe("session");
		expect(
			Object.keys(fetched?.state || {}).some((k) =>
				k.startsWith(State.USER_PREFIX),
			),
		).toBe(false);
	});

	it("applies numRecentEvents then afterTimestamp together", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		const stamps = [100, 200, 300, 400, 500];
		for (const [i, ts] of stamps.entries()) {
			await service.appendEvent(session, {
				author: "user",
				timestamp: ts,
				content: { parts: [{ text: `e${i}` }] },
			} as any);
		}

		const both = await service.getSession("app", "user", "s1", {
			numRecentEvents: 3,
			afterTimestamp: 250,
		});
		expect(both?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"e2",
			"e3",
			"e4",
		]);
	});

	it("keeps all events when afterTimestamp is before every event", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		await service.appendEvent(session, {
			author: "user",
			timestamp: 100,
			content: { parts: [{ text: "only" }] },
		} as any);

		const after = await service.getSession("app", "user", "s1", {
			afterTimestamp: 50,
		});
		expect(after?.events).toHaveLength(1);
		expect(after?.events[0].content?.parts?.[0]?.text).toBe("only");
	});

	it("returns empty events when afterTimestamp is after every event", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		await service.appendEvent(session, {
			author: "user",
			timestamp: 100,
			content: { parts: [{ text: "old" }] },
		} as any);

		const after = await service.getSession("app", "user", "s1", {
			afterTimestamp: 999,
		});
		expect(after?.events).toEqual([]);
	});

	it("returns undefined getSession for unknown app or user", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "s1");
		expect(await service.getSession("other", "user", "s1")).toBeUndefined();
		expect(await service.getSession("app", "other", "s1")).toBeUndefined();
	});

	it("trims padded session ids on create and get", async () => {
		const service = new InMemorySessionService();
		const created = await service.createSession(
			"app",
			"user",
			{ ok: true },
			"  padded  ",
		);
		expect(created.id).toBe("padded");
		expect((await service.getSession("app", "user", "padded"))?.state.ok).toBe(
			true,
		);
	});

	it("createSession without state defaults to empty object", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user");
		expect(session.state).toEqual({});
		expect(session.events).toEqual([]);
		expect(session.lastUpdateTime).toBeGreaterThan(0);
	});

	it("propagates app and user state across sibling sessions", async () => {
		const service = new InMemorySessionService();
		const first = await service.createSession("app", "user", {}, "s1");
		await service.appendEvent(first, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}theme`]: "dark",
					[`${State.USER_PREFIX}locale`]: "en",
				},
			},
		} as any);

		const second = await service.createSession(
			"app",
			"user",
			{ local: 1 },
			"s2",
		);
		expect(second.state[`${State.APP_PREFIX}theme`]).toBe("dark");
		expect(second.state[`${State.USER_PREFIX}locale`]).toBe("en");
		expect(second.state.local).toBe(1);
	});

	it("skips mutating caller history for partial events but still applies app state deltas", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		await service.appendEvent(session, {
			author: "agent",
			partial: true,
			timestamp: 5,
			content: { parts: [{ text: "stream" }] },
			actions: {
				stateDelta: { [`${State.APP_PREFIX}x`]: 1 },
			},
		} as any);

		expect(session.events).toHaveLength(0);
		const fetched = await service.getSession("app", "user", "s1");
		expect(fetched?.events).toHaveLength(0);
		expect(fetched?.state[`${State.APP_PREFIX}x`]).toBe(1);
	});

	it("listSessions clears events and state on returned copies", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		await service.appendEvent(session, {
			author: "user",
			timestamp: 1,
			content: { parts: [{ text: "hi" }] },
		} as any);

		const listed = await service.listSessions("app", "user");
		expect(listed.sessions).toHaveLength(1);
		expect(listed.sessions[0].events).toEqual([]);
		expect(listed.sessions[0].state).toEqual({});
		expect(
			(await service.getSession("app", "user", "s1"))?.events,
		).toHaveLength(1);
	});

	it("appendEvent updates both caller session and storage lastUpdateTime", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		await service.appendEvent(session, {
			author: "user",
			timestamp: 1234.5,
			content: { parts: [{ text: "t" }] },
		} as any);
		expect(session.lastUpdateTime).toBe(1234.5);
		expect(
			(await service.getSession("app", "user", "s1"))?.lastUpdateTime,
		).toBe(1234.5);
	});

	it("sync getSession returns undefined for missing sessions", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = new InMemorySessionService();
		expect(service.getSessionSync("app", "user", "missing")).toBeUndefined();
		expect(service.listSessionsSync("missing", "user").sessions).toEqual([]);
		warn.mockRestore();
	});

	it("stores null app:/user: delta values into app/user state maps", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s-null");
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}flag`]: null,
					[`${State.USER_PREFIX}pref`]: null,
				},
			},
		} as any);

		const sibling = await service.createSession("app", "user", {}, "s-sibling");
		expect(sibling.state[`${State.APP_PREFIX}flag`]).toBeNull();
		expect(sibling.state[`${State.USER_PREFIX}pref`]).toBeNull();
	});

	it("createSession with the same id overwrites the stored session", async () => {
		const service = new InMemorySessionService();
		const first = await service.createSession(
			"app",
			"user",
			{ version: 1 },
			"same-id",
		);
		await service.appendEvent(first, {
			author: "agent",
			timestamp: 1,
			content: { parts: [{ text: "old" }] },
		} as any);

		const second = await service.createSession(
			"app",
			"user",
			{ version: 2 },
			"same-id",
		);
		expect(second.state.version).toBe(2);
		expect(second.events).toEqual([]);

		const fetched = await service.getSession("app", "user", "same-id");
		expect(fetched?.state.version).toBe(2);
		expect(fetched?.events).toEqual([]);
	});

	it("ignores numRecentEvents: 0 because it is falsy", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s-zero");
		for (let i = 0; i < 3; i++) {
			await service.appendEvent(session, {
				author: "user",
				timestamp: 1000 + i,
				content: { parts: [{ text: `e${i}` }] },
			} as any);
		}

		const fetched = await service.getSession("app", "user", "s-zero", {
			numRecentEvents: 0,
		});
		expect(fetched?.events).toHaveLength(3);
	});

	it("updates lastUpdateTime on the caller session even for partial events", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s-partial");
		const before = session.lastUpdateTime;

		await service.appendEvent(session, {
			author: "agent",
			partial: true,
			timestamp: 9999,
			content: { parts: [{ text: "chunk" }] },
		} as any);

		expect(session.events).toHaveLength(0);
		expect(session.lastUpdateTime).toBe(9999);
		expect(session.lastUpdateTime).not.toBe(before);

		// storage lastUpdateTime is updated even though partial events skip history
		const stored = await service.getSession("app", "user", "s-partial");
		expect(stored?.events).toHaveLength(0);
		expect(stored?.lastUpdateTime).toBe(9999);
	});

	it("does not leak app: state across different appName values", async () => {
		const service = new InMemorySessionService();
		const a = await service.createSession("app-a", "user", {}, "s1");
		await service.appendEvent(a, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: { [`${State.APP_PREFIX}theme`]: "dark" },
			},
		} as any);

		const b = await service.createSession("app-b", "user", {}, "s1");
		expect(b.state[`${State.APP_PREFIX}theme`]).toBeUndefined();

		const aFetched = await service.getSession("app-a", "user", "s1");
		expect(aFetched?.state[`${State.APP_PREFIX}theme`]).toBe("dark");
	});

	it("applies user: delta on first write when userState map is absent", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession(
			"fresh-app",
			"fresh-user",
			{},
			"s1",
		);
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: { [`${State.USER_PREFIX}locale`]: "fr" },
			},
		} as any);

		const sibling = await service.createSession(
			"fresh-app",
			"fresh-user",
			{},
			"s2",
		);
		expect(sibling.state[`${State.USER_PREFIX}locale`]).toBe("fr");
	});

	it("getSession with empty events and afterTimestamp returns empty events", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "empty");
		const fetched = await service.getSession("app", "user", "empty", {
			afterTimestamp: 999,
		});
		expect(fetched?.events).toEqual([]);
	});

	it("getSession afterTimestamp keeps all events when all are at or after threshold", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s-all");
		await service.appendEvent(session, {
			author: "user",
			timestamp: 10,
			content: { parts: [{ text: "a" }] },
		} as any);
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 20,
			content: { parts: [{ text: "b" }] },
		} as any);

		const fetched = await service.getSession("app", "user", "s-all", {
			afterTimestamp: 5,
		});
		expect(fetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"a",
			"b",
		]);
	});

	it("getSession applies numRecentEvents then afterTimestamp in sequence", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s-both");
		for (const [ts, text] of [
			[1, "a"],
			[2, "b"],
			[3, "c"],
			[4, "d"],
		] as const) {
			await service.appendEvent(session, {
				author: "user",
				timestamp: ts,
				content: { parts: [{ text }] },
			} as any);
		}

		const fetched = await service.getSession("app", "user", "s-both", {
			numRecentEvents: 3,
			afterTimestamp: 2.5,
		});
		expect(fetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"c",
			"d",
		]);
	});

	it("trims whitespace-only session ids to a generated UUID", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "   ");
		expect(session.id).not.toBe("   ");
		expect(session.id.length).toBeGreaterThan(8);
	});

	it("deleteSession is a no-op for unknown app/user/session combinations", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "keep");
		await service.deleteSession("missing", "user", "keep");
		await service.deleteSession("app", "missing", "keep");
		await service.deleteSession("app", "user", "missing");
		expect(await service.getSession("app", "user", "keep")).toBeDefined();
	});

	it("listSessions returns empty for unknown app even when other apps exist", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "s1");
		expect((await service.listSessions("other", "user")).sessions).toEqual([]);
	});

	it("appendEvent with only session-level delta does not create app/user maps", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession(
			"iso-app",
			"iso-user",
			{},
			"s1",
		);
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 1,
			actions: { stateDelta: { local: "only" } },
		} as any);

		expect((service as any).appState.has("iso-app")).toBe(false);
		expect((service as any).userState.has("iso-app")).toBe(false);

		const sibling = await service.createSession(
			"iso-app",
			"iso-user",
			{},
			"s2",
		);
		expect(sibling.state.local).toBeUndefined();
		expect(
			(await service.getSession("iso-app", "iso-user", "s1"))?.state.local,
		).toBe("only");
	});

	it("warns and returns early when appending to a deleted storage session", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "gone");
		await service.deleteSession("app", "user", "gone");

		const event = {
			author: "agent",
			timestamp: 7,
			content: { parts: [{ text: "late" }] },
			actions: {
				stateDelta: { [`${State.APP_PREFIX}x`]: 1 },
			},
		} as any;

		await expect(service.appendEvent(session, event)).resolves.toBe(event);
		expect(session.events).toHaveLength(1);
		expect(session.lastUpdateTime).toBe(7);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("sessionId gone not in sessions"),
		);
		warn.mockRestore();
	});

	it("propagates app state to a second user under the same app", async () => {
		const service = new InMemorySessionService();
		const u1 = await service.createSession("shared", "u1", {}, "s1");
		await service.appendEvent(u1, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: { [`${State.APP_PREFIX}banner`]: "hello" },
			},
		} as any);

		const u2 = await service.createSession("shared", "u2", {}, "s2");
		expect(u2.state[`${State.APP_PREFIX}banner`]).toBe("hello");
		expect(u2.state[`${State.USER_PREFIX}locale`]).toBeUndefined();
	});

	it("does not share user: state across users of the same app", async () => {
		const service = new InMemorySessionService();
		const u1 = await service.createSession("shared", "u1", {}, "s1");
		await service.appendEvent(u1, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: { [`${State.USER_PREFIX}secret`]: "u1-only" },
			},
		} as any);

		const u2 = await service.createSession("shared", "u2", {}, "s2");
		expect(u2.state[`${State.USER_PREFIX}secret`]).toBeUndefined();
	});

	it("sync deleteSession warns and removes an existing session", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = new InMemorySessionService();
		const session = service.createSessionSync("app", "user", {}, "sync-del");
		service.deleteSessionSync("app", "user", session.id);
		expect(service.getSessionSync("app", "user", "sync-del")).toBeUndefined();
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("getSession returns a deep copy so mutating events does not affect storage", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession(
			"app",
			"user",
			{ a: 1 },
			"copy",
		);
		await service.appendEvent(session, {
			author: "user",
			timestamp: 1,
			content: { parts: [{ text: "hi" }] },
		} as any);

		const fetched = await service.getSession("app", "user", "copy");
		fetched!.events.pop();
		fetched!.state.a = 99;

		const again = await service.getSession("app", "user", "copy");
		expect(again?.events).toHaveLength(1);
		expect(again?.state.a).toBe(1);
	});
});
