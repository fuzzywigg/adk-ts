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
});
