import { describe, expect, it } from "vitest";
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
});
