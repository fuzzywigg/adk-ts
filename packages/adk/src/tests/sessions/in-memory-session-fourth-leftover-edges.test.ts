import { describe, expect, it, vi } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { State } from "../../sessions/state";

describe("InMemorySessionService fourth leftover create/get/list/append/delete matrices", () => {
	it("createSession generates id and stores initial state", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {
			a: 1,
			b: "x",
		});
		expect(session.id).toBeTruthy();
		expect(session.appName).toBe("app");
		expect(session.userId).toBe("user");
		expect(session.state.a).toBe(1);
		expect(session.state.b).toBe("x");
		expect(session.events).toEqual([]);
	});

	it("createSession with whitespace-only id generates a new id", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "   ");
		expect(session.id).toBeTruthy();
		expect(session.id.trim().length).toBeGreaterThan(0);
		expect(session.id).not.toBe("   ");
	});

	it("createSession with explicit id is reusable", async () => {
		const service = new InMemorySessionService();
		const a = await service.createSession("app", "user", { n: 1 }, "fixed");
		const b = await service.createSession("app", "user", { n: 2 }, "fixed");
		expect(a.id).toBe("fixed");
		expect(b.id).toBe("fixed");
	});

	it("getSession returns undefined for unknown app/user/session", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "exists");
		expect(await service.getSession("other", "user", "exists")).toBeUndefined();
		expect(await service.getSession("app", "other", "exists")).toBeUndefined();
		expect(await service.getSession("app", "user", "missing")).toBeUndefined();
	});

	it("getSession numRecentEvents keeps trailing window", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "nr");
		for (let i = 0; i < 5; i++) {
			await service.appendEvent(session, {
				author: "user",
				timestamp: i + 1,
				content: { parts: [{ text: `e${i}` }] },
			} as any);
		}
		const fetched = await service.getSession("app", "user", "nr", {
			numRecentEvents: 2,
		});
		expect(fetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"e3",
			"e4",
		]);
	});

	it("getSession afterTimestamp keeps events with timestamp >= boundary behavior", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "ats");
		for (const ts of [10, 20, 30, 40]) {
			await service.appendEvent(session, {
				author: "user",
				timestamp: ts,
				content: { parts: [{ text: String(ts) }] },
			} as any);
		}
		const fetched = await service.getSession("app", "user", "ats", {
			afterTimestamp: 20,
		});
		const texts = fetched?.events.map((e) => e.content?.parts?.[0]?.text);
		expect(texts).toEqual(expect.arrayContaining(["20", "30", "40"]));
		expect(texts).not.toContain("10");
	});

	it("listSessions returns empty for unknown user and strips events/state", async () => {
		const service = new InMemorySessionService();
		const created = await service.createSession("app", "user", { k: 1 }, "s1");
		await service.appendEvent(created, {
			author: "user",
			timestamp: 1,
			content: { parts: [{ text: "hi" }] },
		} as any);
		expect((await service.listSessions("app", "nobody")).sessions).toEqual([]);
		const listed = await service.listSessions("app", "user");
		expect(listed.sessions).toHaveLength(1);
		expect(listed.sessions[0].id).toBe("s1");
		expect(listed.sessions[0].events).toEqual([]);
		expect(listed.sessions[0].state).toEqual({});
	});

	it("listSessions does not leak other users", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "u1", {}, "a");
		await service.createSession("app", "u2", {}, "b");
		await service.createSession("app", "u1", {}, "c");
		const listed = await service.listSessions("app", "u1");
		expect(listed.sessions.map((s) => s.id).sort()).toEqual(["a", "c"]);
	});

	it("deleteSession removes session; delete missing is no-op", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "del");
		await service.deleteSession("app", "user", "del");
		expect(await service.getSession("app", "user", "del")).toBeUndefined();
		await expect(
			service.deleteSession("app", "user", "del"),
		).resolves.toBeUndefined();
	});

	it("appendEvent sets lastUpdateTime from event timestamp", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "ts");
		await service.appendEvent(session, {
			author: "user",
			timestamp: 99,
			content: { parts: [{ text: "hi" }] },
		} as any);
		expect(session.lastUpdateTime).toBe(99);
		expect(session.events).toHaveLength(1);
	});

	it("merges app: and user: state deltas across getSession", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "stateful");
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}theme`]: "dark",
					[`${State.USER_PREFIX}locale`]: "en",
					local: "session",
				},
			},
		} as any);
		const fetched = await service.getSession("app", "user", "stateful");
		expect(fetched?.state[`${State.APP_PREFIX}theme`]).toBe("dark");
		expect(fetched?.state[`${State.USER_PREFIX}locale`]).toBe("en");
		expect(fetched?.state.local).toBe("session");
	});

	it("temp: deltas persist on in-memory session (DB drops temp:)", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "temp");
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: { [`${State.TEMP_PREFIX}scratch`]: 42 },
			},
		} as any);
		const fetched = await service.getSession("app", "user", "temp");
		expect(fetched?.state[`${State.TEMP_PREFIX}scratch`]).toBe(42);
	});

	it("app state merges into later sessions for same app", async () => {
		const service = new InMemorySessionService();
		const first = await service.createSession("app", "user", {}, "s1");
		await service.appendEvent(first, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: { [`${State.APP_PREFIX}flag`]: true },
			},
		} as any);
		const second = await service.createSession("app", "user", {}, "s2");
		const fetched = await service.getSession("app", "user", "s2");
		expect(fetched?.state[`${State.APP_PREFIX}flag`]).toBe(true);
		expect(second.state[`${State.APP_PREFIX}flag`]).toBe(true);
	});

	it("sequential concurrent-ish creates with distinct ids all succeed", async () => {
		const service = new InMemorySessionService();
		const sessions = await Promise.all(
			Array.from({ length: 10 }, (_, i) =>
				service.createSession("app", "user", { i }, `p${i}`),
			),
		);
		expect(new Set(sessions.map((s) => s.id)).size).toBe(10);
		expect((await service.listSessions("app", "user")).sessions).toHaveLength(
			10,
		);
	});

	it("sequential appends grow events in order", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "seq");
		for (const text of ["a", "b", "c"]) {
			await service.appendEvent(session, {
				author: "user",
				timestamp: text.charCodeAt(0),
				content: { parts: [{ text }] },
			} as any);
		}
		expect(session.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("getSession clones nested state so mutations do not leak", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", { nested: { n: 1 } }, "clone");
		const fetched = await service.getSession("app", "user", "clone");
		(fetched!.state as any).nested.n = 99;
		const again = await service.getSession("app", "user", "clone");
		expect((again!.state as any).nested.n).toBe(1);
	});

	it("appendEvent to unknown storage session warns and returns event", async () => {
		const service = new InMemorySessionService();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const orphan = {
			appName: "app",
			userId: "user",
			id: "orphan",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};
		const event = {
			author: "user",
			timestamp: 5,
			content: { parts: [{ text: "x" }] },
		};
		const returned = await service.appendEvent(orphan as any, event as any);
		expect(returned).toBe(event);
		expect(warn).toHaveBeenCalled();
		expect(orphan.lastUpdateTime).toBe(5);
	});

	it("createSessionSync / getSessionSync / listSessionsSync / deleteSessionSync still work", () => {
		const service = new InMemorySessionService();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const created = service.createSessionSync("app", "user", { z: 1 }, "sync");
		expect(created.id).toBe("sync");
		expect(service.getSessionSync("app", "user", "sync")?.state.z).toBe(1);
		expect(service.listSessionsSync("app", "user").sessions).toHaveLength(1);
		service.deleteSessionSync("app", "user", "sync");
		expect(service.getSessionSync("app", "user", "sync")).toBeUndefined();
		expect(warn).toHaveBeenCalled();
	});

	it("empty content parts still store the event", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "empty");
		await service.appendEvent(session, {
			author: "user",
			timestamp: 1,
			content: { parts: [] },
		} as any);
		expect(session.events).toHaveLength(1);
	});

	it("numRecentEvents of 1 returns only the last event", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "one");
		for (const text of ["first", "second", "third"]) {
			await service.appendEvent(session, {
				author: "user",
				timestamp: 1,
				content: { parts: [{ text }] },
			} as any);
		}
		const fetched = await service.getSession("app", "user", "one", {
			numRecentEvents: 1,
		});
		expect(fetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"third",
		]);
	});
});
