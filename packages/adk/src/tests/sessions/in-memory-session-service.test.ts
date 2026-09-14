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

	it("getSession/getSessionSync return undefined when map entry is nullish", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "ghost");
		const userMap = (service as any).sessions.get("app").get("user") as Map<
			string,
			unknown
		>;
		userMap.set("ghost", null);
		expect(await service.getSession("app", "user", "ghost")).toBeUndefined();
		expect(service.getSessionSync("app", "user", "ghost")).toBeUndefined();

		userMap.set("ghost", undefined);
		expect(await service.getSession("app", "user", "ghost")).toBeUndefined();
		expect(service.getSessionSync("app", "user", "ghost")).toBeUndefined();
		warn.mockRestore();
	});

	it("getSession applies afterTimestamp when all events are newer", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s-new");
		for (let i = 0; i < 3; i++) {
			await service.appendEvent(session, {
				author: "agent",
				timestamp: 100 + i,
				content: { parts: [{ text: `e${i}` }] },
			} as any);
		}
		const fetched = await service.getSession("app", "user", "s-new", {
			afterTimestamp: 50,
		});
		expect(fetched?.events).toHaveLength(3);
	});

	it("getSession afterTimestamp drops a trailing older prefix", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s-old");
		for (const ts of [10, 20, 30, 40]) {
			await service.appendEvent(session, {
				author: "agent",
				timestamp: ts,
				content: { parts: [{ text: `t${ts}` }] },
			} as any);
		}
		const fetched = await service.getSession("app", "user", "s-old", {
			afterTimestamp: 25,
		});
		expect(fetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"t30",
			"t40",
		]);
	});

	it("listSessions returns empty for unknown app or user", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "s1");
		expect((await service.listSessions("other", "user")).sessions).toEqual([]);
		expect((await service.listSessions("app", "other")).sessions).toEqual([]);
	});

	it("deleteSession is a no-op for missing nested maps", async () => {
		const service = new InMemorySessionService();
		await expect(
			service.deleteSession("missing-app", "u", "s"),
		).resolves.toBeUndefined();
		await service.createSession("app", "user", {}, "s1");
		await expect(
			service.deleteSession("app", "other-user", "s1"),
		).resolves.toBeUndefined();
		await expect(
			service.deleteSession("app", "user", "missing"),
		).resolves.toBeUndefined();
		expect((await service.getSession("app", "user", "s1"))?.id).toBe("s1");
	});
});
