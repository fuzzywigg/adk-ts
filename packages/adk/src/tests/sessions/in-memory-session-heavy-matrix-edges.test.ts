import { describe, expect, it, vi } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { State } from "../../sessions/state";

describe("InMemorySessionService heavy matrix leftover edges", () => {
	it("createSession generates an id when omitted and stores initial state", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", { a: 1 });
		expect(session.id).toBeTruthy();
		expect(session.state.a).toBe(1);
		expect(session.appName).toBe("app");
		expect(session.userId).toBe("user");
	});

	it("createSession with explicit id is idempotent-unique per app/user", async () => {
		const service = new InMemorySessionService();
		const a = await service.createSession("app", "user", {}, "fixed");
		const b = await service.createSession("app", "user", {}, "fixed");
		expect(a.id).toBe("fixed");
		expect(b.id).toBe("fixed");
	});

	it("appendEvent sets lastUpdateTime from the event timestamp and grows events", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		await service.appendEvent(session, {
			author: "user",
			timestamp: 100,
			content: { parts: [{ text: "hi" }] },
		} as any);
		expect(session.events).toHaveLength(1);
		expect(session.lastUpdateTime).toBe(100);
	});

	it("getSession numRecentEvents keeps only the trailing window", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s2");
		for (let i = 0; i < 5; i++) {
			await service.appendEvent(session, {
				author: "user",
				timestamp: i + 1,
				content: { parts: [{ text: `e${i}` }] },
			} as any);
		}
		const fetched = await service.getSession("app", "user", "s2", {
			numRecentEvents: 2,
		});
		expect(fetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"e3",
			"e4",
		]);
	});

	it("getSession afterTimestamp keeps events with timestamp > filter", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s3");
		for (const ts of [10, 20, 30]) {
			await service.appendEvent(session, {
				author: "user",
				timestamp: ts,
				content: { parts: [{ text: String(ts) }] },
			} as any);
		}
		const fetched = await service.getSession("app", "user", "s3", {
			afterTimestamp: 15,
		});
		const texts = fetched?.events.map((e) => e.content?.parts?.[0]?.text);
		expect(texts).toEqual(expect.arrayContaining(["20", "30"]));
		expect(texts).not.toContain("10");
	});

	it("listSessions returns sessions for a user without leaking other users", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "u1", {}, "a");
		await service.createSession("app", "u2", {}, "b");
		const listed = await service.listSessions("app", "u1");
		expect(listed.sessions.map((s) => s.id).sort()).toEqual(["a"]);
	});

	it("deleteSession removes the session and subsequent get returns null/undefined", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "del");
		await service.deleteSession("app", "user", "del");
		expect(await service.getSession("app", "user", "del")).toBeFalsy();
	});

	it("merges app: state deltas into session state on append", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "appstate");
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: { [`${State.APP_PREFIX}theme`]: "dark" },
			},
		} as any);
		const fetched = await service.getSession("app", "user", "appstate");
		expect(fetched?.state[`${State.APP_PREFIX}theme`]).toBe("dark");
	});

	it("merges user: state deltas into session state on append", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "userstate");
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: { [`${State.USER_PREFIX}locale`]: "en" },
			},
		} as any);
		const fetched = await service.getSession("app", "user", "userstate");
		expect(fetched?.state[`${State.USER_PREFIX}locale`]).toBe("en");
	});

	it("temp: deltas persist on in-memory session state (asymmetry vs Database temp: drop)", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "temp");
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: { [`${State.TEMP_PREFIX}scratch`]: 1 },
			},
		} as any);
		const fetched = await service.getSession("app", "user", "temp");
		expect(fetched?.state[`${State.TEMP_PREFIX}scratch`]).toBe(1);
	});

	it("getSession returns null for unknown ids", async () => {
		const service = new InMemorySessionService();
		expect(await service.getSession("app", "user", "missing")).toBeFalsy();
	});

	it("appendEvent with empty content still stores the event", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "empty");
		await service.appendEvent(session, {
			author: "user",
			timestamp: 1,
			content: { parts: [] },
		} as any);
		expect(session.events).toHaveLength(1);
	});

	it("concurrent createSession with different ids both succeed", async () => {
		const service = new InMemorySessionService();
		const sessions = await Promise.all(
			Array.from({ length: 8 }, (_, i) =>
				service.createSession("app", "user", {}, `p${i}`),
			),
		);
		expect(new Set(sessions.map((s) => s.id)).size).toBe(8);
		expect((await service.listSessions("app", "user")).sessions).toHaveLength(
			8,
		);
	});

	it("session state objects are cloned on getSession", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", { nested: { n: 1 } }, "clone");
		const fetched = await service.getSession("app", "user", "clone");
		(fetched!.state as any).nested.n = 99;
		const again = await service.getSession("app", "user", "clone");
		expect((again!.state as any).nested.n).toBe(1);
	});
});

describe("State heavy matrix leftover edges", () => {
	it("delta overrides value in get/has/toDict", () => {
		const state = State.create({ k: "v" }, { k: "d" });
		expect(state.get("k")).toBe("d");
		expect(state.has("k")).toBe(true);
		expect(state.toDict()).toEqual({ k: "d" });
	});

	it("set writes both value and delta maps", () => {
		const value: Record<string, any> = {};
		const delta: Record<string, any> = {};
		const state = State.create(value, delta);
		state.set("x", 1);
		expect(value.x).toBe(1);
		expect(delta.x).toBe(1);
		expect(state.hasDelta()).toBe(true);
	});

	it("update merges keys and preserves unrelated delta", () => {
		const state = State.create({ a: 1 }, { b: 2 });
		state.update({ a: 3, c: 4 });
		expect(state.toDict()).toEqual({ a: 3, b: 2, c: 4 });
	});

	it("returns default only when key missing from value and delta", () => {
		const state = State.create({ a: 1 }, {});
		expect(state.get("missing", "fallback")).toBe("fallback");
		expect(state.get("a", "fallback")).toBe(1);
	});

	it("prefix constants are stable strings", () => {
		expect(State.APP_PREFIX.endsWith(":") || State.APP_PREFIX.length > 0).toBe(
			true,
		);
		expect(State.USER_PREFIX.length).toBeGreaterThan(0);
		expect(State.TEMP_PREFIX.length).toBeGreaterThan(0);
	});
});
