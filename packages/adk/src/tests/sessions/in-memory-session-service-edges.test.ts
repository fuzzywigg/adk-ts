import { describe, expect, it, vi } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { State } from "../../sessions/state";

describe("InMemorySessionService leftover edges", () => {
	it("warns with exact messages when appendEvent storage path is missing", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = new InMemorySessionService();

		await service.appendEvent(
			{
				appName: "missing-app",
				userId: "u",
				id: "s",
				state: {},
				events: [],
				lastUpdateTime: 0,
			},
			{ author: "agent", timestamp: 1 } as any,
		);
		expect(warn).toHaveBeenCalledWith(
			"Failed to append event to session s: appName missing-app not in sessions",
		);

		await service.createSession("app", "u", {}, "s1");
		await service.appendEvent(
			{
				appName: "app",
				userId: "other",
				id: "s1",
				state: {},
				events: [],
				lastUpdateTime: 0,
			},
			{ author: "agent", timestamp: 2 } as any,
		);
		expect(warn).toHaveBeenCalledWith(
			"Failed to append event to session s1: userId other not in sessions[appName]",
		);

		await service.appendEvent(
			{
				appName: "app",
				userId: "u",
				id: "ghost",
				state: {},
				events: [],
				lastUpdateTime: 0,
			},
			{ author: "agent", timestamp: 3 } as any,
		);
		expect(warn).toHaveBeenCalledWith(
			"Failed to append event to session ghost: sessionId ghost not in sessions[appName][userId]",
		);
		warn.mockRestore();
	});

	it("deprecated sync methods emit the migrate warning", () => {
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

		expect(
			warn.mock.calls.filter((c) =>
				String(c[0]).includes(
					"Deprecated. Please migrate to the async method.",
				),
			).length,
		).toBeGreaterThanOrEqual(4);
		warn.mockRestore();
	});

	it("createSession trims whitespace-only ids to generated UUID", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "\t  ");
		expect(session.id).not.toMatch(/^\s*$/);
		expect(session.id.length).toBeGreaterThan(8);
	});

	it("getSession applies numRecentEvents before afterTimestamp", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "order");
		for (let i = 0; i < 5; i++) {
			await service.appendEvent(session, {
				author: "agent",
				timestamp: 100 + i,
				content: { parts: [{ text: `t${i}` }] },
			} as any);
		}

		// First slice(-3) => t2,t3,t4; then afterTimestamp 102.5 drops t2.
		const fetched = await service.getSession("app", "user", "order", {
			numRecentEvents: 3,
			afterTimestamp: 102.5,
		});
		expect(fetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"t3",
			"t4",
		]);
	});

	it("getSession afterTimestamp with all events newer keeps the sliced set", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "all-new");
		await service.appendEvent(session, {
			author: "a",
			timestamp: 10,
			content: { parts: [{ text: "a" }] },
		} as any);
		await service.appendEvent(session, {
			author: "b",
			timestamp: 20,
			content: { parts: [{ text: "b" }] },
		} as any);

		const fetched = await service.getSession("app", "user", "all-new", {
			afterTimestamp: 1,
		});
		expect(fetched?.events).toHaveLength(2);
	});

	it("appendEvent with actions but undefined stateDelta still stores event", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "no-delta");
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 5,
			actions: { escalate: true },
			content: { parts: [{ text: "x" }] },
		} as any);

		const fetched = await service.getSession("app", "user", "no-delta");
		expect(fetched?.events).toHaveLength(1);
		expect(fetched?.events[0].actions?.escalate).toBe(true);
	});

	it("structuredClone of events with Set longRunningToolIds survives getSession", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "set-clone");
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 1,
			longRunningToolIds: new Set(["t1", "t2"]),
			content: { parts: [{ text: "go" }] },
		} as any);

		const fetched = await service.getSession("app", "user", "set-clone");
		expect(fetched?.events[0].longRunningToolIds).toEqual(
			new Set(["t1", "t2"]),
		);
	});

	it("listSessions returns empty for unknown app", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "s1");
		expect(await service.listSessions("other", "user")).toEqual({
			sessions: [],
		});
	});

	it("deleteSession is a no-op for missing sessions", async () => {
		const service = new InMemorySessionService();
		await expect(
			service.deleteSession("app", "user", "missing"),
		).resolves.toBeUndefined();
	});

	it("mergeState only adds user keys when userState map exists", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "merge");
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: { [`${State.APP_PREFIX}only`]: 1 },
			},
		} as any);

		const otherUser = await service.createSession("app", "other", {}, "o1");
		expect(otherUser.state[`${State.APP_PREFIX}only`]).toBe(1);
		expect(otherUser.state[`${State.USER_PREFIX}x`]).toBeUndefined();
	});

	it("caller session and storage session both receive event copies via append", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "dual");
		const event = {
			author: "user",
			timestamp: 9,
			content: { parts: [{ text: "hi" }] },
		} as any;
		await service.appendEvent(session, event);
		expect(session.events).toHaveLength(1);
		expect(
			(await service.getSession("app", "user", "dual"))?.events,
		).toHaveLength(1);
	});

	it("getSession returns undefined when app exists but user does not", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user-a", {}, "s1");
		expect(await service.getSession("app", "user-b", "s1")).toBeUndefined();
	});

	it("partial event updates lastUpdateTime on caller session", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession(
			"app",
			"user",
			{},
			"partial-lut",
		);
		await service.appendEvent(session, {
			author: "agent",
			partial: true,
			timestamp: 777,
			content: { parts: [{ text: "stream" }] },
		} as any);
		expect(session.lastUpdateTime).toBe(777);
		expect(session.events).toHaveLength(0);
	});
});
