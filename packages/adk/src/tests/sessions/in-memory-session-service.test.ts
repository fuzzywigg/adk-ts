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

	it("trims blank session ids to a generated uuid", async () => {
		const service = new InMemorySessionService();
		const blank = await service.createSession("app", "user", {}, "   ");
		expect(blank.id).toBeTruthy();
		expect(blank.id.trim().length).toBeGreaterThan(0);
		expect(blank.id).not.toBe("   ");

		const empty = await service.createSession("app", "user", {}, "");
		expect(empty.id).toBeTruthy();
		expect(empty.id).not.toBe("");
	});

	it("returns undefined for unknown app or user on getSession", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "s1");

		expect(await service.getSession("other-app", "user", "s1")).toBeUndefined();
		expect(await service.getSession("app", "other-user", "s1")).toBeUndefined();
		expect(
			await service.listSessions("other-app", "user").then((r) => r.sessions),
		).toEqual([]);
	});

	it("afterTimestamp keeps all events when every event is after the cutoff", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		await service.appendEvent(session, {
			author: "user",
			timestamp: 2000,
			content: { parts: [{ text: "a" }] },
		} as any);
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 3000,
			content: { parts: [{ text: "b" }] },
		} as any);

		const after = await service.getSession("app", "user", "s1", {
			afterTimestamp: 1000,
		});
		expect(after?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"a",
			"b",
		]);
	});

	it("warns for missing userId and sessionId when appending", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "s1");

		await service.appendEvent(
			{
				appName: "app",
				userId: "ghost-user",
				id: "s1",
				state: {},
				events: [],
				lastUpdateTime: 1,
			} as any,
			{
				author: "user",
				timestamp: 2,
				content: { parts: [{ text: "x" }] },
			} as any,
		);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("userId ghost-user not in sessions[appName]"),
		);

		await service.appendEvent(
			{
				appName: "app",
				userId: "user",
				id: "ghost-session",
				state: {},
				events: [],
				lastUpdateTime: 1,
			} as any,
			{
				author: "user",
				timestamp: 3,
				content: { parts: [{ text: "y" }] },
			} as any,
		);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(
				"sessionId ghost-session not in sessions[appName][userId]",
			),
		);
		warn.mockRestore();
	});

	it("persists app and user state across sessions while keeping session-local keys local", async () => {
		const service = new InMemorySessionService();
		const s1 = await service.createSession("app", "user", { local: 1 }, "s1");

		await service.appendEvent(s1, {
			author: "agent",
			timestamp: 10,
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}theme`]: "dark",
					[`${State.USER_PREFIX}locale`]: "en",
					[`${State.TEMP_PREFIX}scratch`]: "ephemeral",
					local: 2,
				},
			},
		} as any);

		const s2 = await service.createSession("app", "user", {}, "s2");
		expect(s2.state[`${State.APP_PREFIX}theme`]).toBe("dark");
		expect(s2.state[`${State.USER_PREFIX}locale`]).toBe("en");
		expect(s2.state.local).toBeUndefined();
		expect(s2.state[`${State.TEMP_PREFIX}scratch`]).toBeUndefined();

		const fetchedS1 = await service.getSession("app", "user", "s1");
		expect(fetchedS1?.state.local).toBe(2);
		expect(fetchedS1?.state[`${State.APP_PREFIX}theme`]).toBe("dark");
	});

	it("deleteSession is a no-op for missing sessions", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "s1");
		await expect(
			service.deleteSession("app", "user", "missing"),
		).resolves.toBeUndefined();
		expect(await service.getSession("app", "user", "s1")).toBeTruthy();
	});

	it("skips partial events and events without stateDelta", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");

		await service.appendEvent(session, {
			author: "agent",
			partial: true,
			timestamp: 1,
			actions: { stateDelta: { a: 99 } },
		} as any);
		expect(session.state.a).toBe(1);
		expect(session.events).toEqual([]);

		await service.appendEvent(session, {
			author: "user",
			timestamp: 2,
			content: { parts: [{ text: "hi" }] },
		} as any);
		expect(session.events).toHaveLength(1);
		expect(session.state.a).toBe(1);

		const stored = await service.getSession("app", "user", "s1");
		expect(stored?.events).toHaveLength(1);
	});

	it("merges app-only state when user state map is absent", async () => {
		const service = new InMemorySessionService();
		const s1 = await service.createSession("app", "user-a", {}, "s1");
		await service.appendEvent(s1, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}flag`]: true,
				},
			},
		} as any);

		const s2 = await service.createSession("app", "user-b", {}, "s2");
		expect(s2.state[`${State.APP_PREFIX}flag`]).toBe(true);
		expect(
			Object.keys(s2.state).some((k) => k.startsWith(State.USER_PREFIX)),
		).toBe(false);
	});

	it("isolates sessions across apps with the same user and session id", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app-a", "user", { x: 1 }, "shared");
		await service.createSession("app-b", "user", { x: 2 }, "shared");

		expect((await service.getSession("app-a", "user", "shared"))?.state.x).toBe(
			1,
		);
		expect((await service.getSession("app-b", "user", "shared"))?.state.x).toBe(
			2,
		);
		expect((await service.listSessions("app-a", "user")).sessions).toHaveLength(
			1,
		);
		expect((await service.listSessions("app-b", "user")).sessions).toHaveLength(
			1,
		);
	});

	it("combines numRecentEvents with afterTimestamp filters", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		for (const [ts, text] of [
			[1000, "a"],
			[2000, "b"],
			[3000, "c"],
			[4000, "d"],
		] as const) {
			await service.appendEvent(session, {
				author: "user",
				timestamp: ts,
				content: { parts: [{ text }] },
			} as any);
		}

		const filtered = await service.getSession("app", "user", "s1", {
			numRecentEvents: 3,
			afterTimestamp: 1500,
		});
		expect(filtered?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"b",
			"c",
			"d",
		]);
	});

	it("updates lastUpdateTime on both caller and storage session", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		const before = session.lastUpdateTime;

		await service.appendEvent(session, {
			author: "user",
			timestamp: before + 100,
			content: { parts: [{ text: "tick" }] },
		} as any);

		expect(session.lastUpdateTime).toBe(before + 100);
		const stored = await service.getSession("app", "user", "s1");
		expect(stored?.lastUpdateTime).toBe(before + 100);
	});

	it("preserves trimmed non-blank custom ids", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession(
			"app",
			"user",
			{},
			"  custom-id  ",
		);
		expect(session.id).toBe("custom-id");
		expect(await service.getSession("app", "user", "custom-id")).toBeTruthy();
	});

	it("overwrites app and user state on subsequent deltas", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");

		await service.appendEvent(session, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}theme`]: "dark",
					[`${State.USER_PREFIX}locale`]: "en",
				},
			},
		} as any);
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 2,
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}theme`]: "light",
					[`${State.USER_PREFIX}locale`]: "fr",
				},
			},
		} as any);

		const other = await service.createSession("app", "user", {}, "s2");
		expect(other.state[`${State.APP_PREFIX}theme`]).toBe("light");
		expect(other.state[`${State.USER_PREFIX}locale`]).toBe("fr");
	});

	it("allows recreate after delete with the same session id", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", { v: 1 }, "reuse");
		await service.deleteSession("app", "user", "reuse");
		const again = await service.createSession("app", "user", { v: 2 }, "reuse");
		expect(again.state.v).toBe(2);
		expect((await service.getSession("app", "user", "reuse"))?.state.v).toBe(2);
		expect((await service.listSessions("app", "user")).sessions).toHaveLength(
			1,
		);
	});

	it("does not leak caller mutations into storage via structuredClone", async () => {
		const service = new InMemorySessionService();
		const created = await service.createSession("app", "user", { a: 1 }, "s1");
		created.state.a = 99;
		created.events.push({
			author: "user",
			timestamp: 1,
			content: { parts: [{ text: "leaked" }] },
		} as any);

		const stored = await service.getSession("app", "user", "s1");
		expect(stored?.state.a).toBe(1);
		expect(stored?.events).toEqual([]);
	});

	it("listSessions strips events and state from summaries", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession(
			"app",
			"user",
			{ keep: true },
			"s1",
		);
		await service.appendEvent(session, {
			author: "user",
			timestamp: 1,
			content: { parts: [{ text: "hi" }] },
			actions: {
				stateDelta: { [`${State.APP_PREFIX}x`]: 1 },
			},
		} as any);

		const listed = await service.listSessions("app", "user");
		expect(listed.sessions).toHaveLength(1);
		expect(listed.sessions[0].events).toEqual([]);
		expect(listed.sessions[0].state).toEqual({});
		expect(listed.sessions[0].id).toBe("s1");
	});

	it("getSession with numRecentEvents larger than history returns all", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		await service.appendEvent(session, {
			author: "user",
			timestamp: 1,
			content: { parts: [{ text: "only" }] },
		} as any);

		const fetched = await service.getSession("app", "user", "s1", {
			numRecentEvents: 50,
		});
		expect(fetched?.events).toHaveLength(1);
	});
});
