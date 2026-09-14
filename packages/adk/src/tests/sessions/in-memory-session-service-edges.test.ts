import { describe, expect, it } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { State } from "../../sessions/state";

describe("InMemorySessionService leftover edges", () => {
	it("createSession with empty state object still returns a session", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {});
		expect(session.state).toEqual({});
		expect(session.events).toEqual([]);
		expect(session.lastUpdateTime).toBeTypeOf("number");
	});

	it("createSession without state argument defaults to empty state", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user");
		expect(session.state).toEqual({});
	});

	it("getSessionSync returns undefined for unknown nested maps", () => {
		const service = new InMemorySessionService();
		expect((service as any).getSessionSync("a", "u", "s")).toBeUndefined();
	});

	it("listSessions isolates by appName and userId", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app-a", "user-1", {}, "s1");
		await service.createSession("app-a", "user-2", {}, "s2");
		await service.createSession("app-b", "user-1", {}, "s3");

		expect(
			(await service.listSessions("app-a", "user-1")).sessions.map((s) => s.id),
		).toEqual(["s1"]);
		expect(
			(await service.listSessions("app-a", "user-2")).sessions.map((s) => s.id),
		).toEqual(["s2"]);
		expect(
			(await service.listSessions("app-b", "user-1")).sessions.map((s) => s.id),
		).toEqual(["s3"]);
		expect((await service.listSessions("missing", "user-1")).sessions).toEqual(
			[],
		);
	});

	it("appendEvent without stateDelta still updates lastUpdateTime and events", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		const before = session.lastUpdateTime;
		await service.appendEvent(session, {
			author: "user",
			timestamp: before + 10,
			content: { parts: [{ text: "hi" }] },
		} as any);
		expect(session.events).toHaveLength(1);
		expect(session.lastUpdateTime).toBe(before + 10);
	});

	it("appendEvent skips temp_ keys in session state while keeping temp: keys", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 100,
			actions: {
				stateDelta: {
					temp_scratch: "skipped",
					[`${State.TEMP_PREFIX}scratch`]: "kept-colon",
					local: "keep",
				},
			},
		} as any);

		const fetched = await service.getSession("app", "user", "s1");
		expect(fetched?.state.local).toBe("keep");
		expect(fetched?.state.temp_scratch).toBeUndefined();
		expect(fetched?.state[`${State.TEMP_PREFIX}scratch`]).toBe("kept-colon");
	});

	it("getSession with afterTimestamp filters older events", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		await service.appendEvent(session, {
			author: "user",
			timestamp: 10,
			content: { parts: [{ text: "old" }] },
		} as any);
		await service.appendEvent(session, {
			author: "user",
			timestamp: 20,
			content: { parts: [{ text: "new" }] },
		} as any);

		const filtered = await service.getSession("app", "user", "s1", {
			afterTimestamp: 15,
		});
		expect(filtered?.events.map((e) => (e as any).timestamp)).toEqual([20]);
	});

	it("getSession with numRecentEvents limits the returned tail", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		for (let i = 0; i < 5; i++) {
			await service.appendEvent(session, {
				author: "user",
				timestamp: i + 1,
				content: { parts: [{ text: String(i) }] },
			} as any);
		}
		const limited = await service.getSession("app", "user", "s1", {
			numRecentEvents: 2,
		});
		expect(limited?.events).toHaveLength(2);
		expect(
			limited?.events.map((e) => (e.content as any).parts[0].text),
		).toEqual(["3", "4"]);
	});

	it("deleteSession is a no-op when app or user maps are missing", async () => {
		const service = new InMemorySessionService();
		await expect(
			service.deleteSession("missing-app", "user", "s1"),
		).resolves.toBeUndefined();
		await service.createSession("app", "user", {}, "s1");
		await expect(
			service.deleteSession("app", "other-user", "s1"),
		).resolves.toBeUndefined();
		expect(await service.getSession("app", "user", "s1")).toBeDefined();
	});

	it("overwriting the same session id replaces the prior session object", async () => {
		const service = new InMemorySessionService();
		const first = await service.createSession("app", "user", { v: 1 }, "same");
		const second = await service.createSession("app", "user", { v: 2 }, "same");
		expect(second.state.v).toBe(2);
		const fetched = await service.getSession("app", "user", "same");
		expect(fetched?.state.v).toBe(2);
		expect(fetched?.id).toBe(first.id);
	});

	it("app and user state persist across sessions for the same app/user", async () => {
		const service = new InMemorySessionService();
		const s1 = await service.createSession("app", "user", {}, "s1");
		await service.appendEvent(s1, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}theme`]: "dark",
					[`${State.USER_PREFIX}locale`]: "en",
				},
			},
		} as any);

		const s2 = await service.createSession("app", "user", {}, "s2");
		expect(s2.state[`${State.APP_PREFIX}theme`]).toBe("dark");
		expect(s2.state[`${State.USER_PREFIX}locale`]).toBe("en");
		const fetched = await service.getSession("app", "user", "s2");
		expect(fetched?.state[`${State.APP_PREFIX}theme`]).toBe("dark");
		expect(fetched?.state[`${State.USER_PREFIX}locale`]).toBe("en");
	});

	it("listSessions returns shallow copies without events/state mutation leakage", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		await service.appendEvent(session, {
			author: "user",
			timestamp: 1,
			content: { parts: [{ text: "x" }] },
		} as any);

		const listed = await service.listSessions("app", "user");
		expect(listed.sessions[0].events).toEqual([]);
		expect(listed.sessions[0].state).toEqual({});
		listed.sessions[0].state.hacked = true;
		const fetched = await service.getSession("app", "user", "s1");
		expect(fetched?.state.hacked).toBeUndefined();
		expect(fetched?.state.a).toBe(1);
	});
});
