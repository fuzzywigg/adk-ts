import { describe, expect, it, vi } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { State } from "../../sessions/state";

describe("InMemorySessionService leftover edges (post #113)", () => {
	it("treats numRecentEvents: 0 as falsy and returns the full history", async () => {
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

	it("treats afterTimestamp: 0 as falsy and skips the time filter", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s-after0");
		await service.appendEvent(session, {
			author: "user",
			timestamp: -10,
			content: { parts: [{ text: "ancient" }] },
		} as any);
		await service.appendEvent(session, {
			author: "user",
			timestamp: 5,
			content: { parts: [{ text: "recent" }] },
		} as any);

		const fetched = await service.getSession("app", "user", "s-after0", {
			afterTimestamp: 0,
		});
		expect(fetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"ancient",
			"recent",
		]);
	});

	it("keeps events whose timestamp equals afterTimestamp", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s-eq");
		await service.appendEvent(session, {
			author: "user",
			timestamp: 10,
			content: { parts: [{ text: "boundary" }] },
		} as any);
		await service.appendEvent(session, {
			author: "user",
			timestamp: 20,
			content: { parts: [{ text: "newer" }] },
		} as any);

		const fetched = await service.getSession("app", "user", "s-eq", {
			afterTimestamp: 10,
		});
		expect(fetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"boundary",
			"newer",
		]);
	});

	it("getSession without config returns a deep clone of events and state", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession(
			"app",
			"user",
			{ a: 1 },
			"s-copy",
		);
		await service.appendEvent(session, {
			author: "user",
			timestamp: 1,
			content: { parts: [{ text: "hi" }] },
		} as any);

		const fetched = await service.getSession("app", "user", "s-copy");
		fetched!.events.pop();
		fetched!.state.a = 99;

		const again = await service.getSession("app", "user", "s-copy");
		expect(again?.events).toHaveLength(1);
		expect(again?.state.a).toBe(1);
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
		expect(
			(await service.getSession("app-a", "user", "s1"))?.state[
				`${State.APP_PREFIX}theme`
			],
		).toBe("dark");
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

	it("updates lastUpdateTime on the caller even for partial events", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s-partial");
		await service.appendEvent(session, {
			author: "agent",
			partial: true,
			timestamp: 9999,
			content: { parts: [{ text: "chunk" }] },
		} as any);

		expect(session.events).toHaveLength(0);
		expect(session.lastUpdateTime).toBe(9999);
		const stored = await service.getSession("app", "user", "s-partial");
		expect(stored?.events).toHaveLength(0);
		expect(stored?.lastUpdateTime).toBe(9999);
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
		expect(
			(await service.getSession("iso-app", "iso-user", "s1"))?.state.local,
		).toBe("only");
	});
});

describe("InMemorySessionService leftover numRecentEvents and clone edges", () => {
	it("numRecentEvents: 0 is falsy and does not slice the event history", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s-nre0");
		for (const text of ["a", "b", "c", "d"]) {
			await service.appendEvent(session, {
				author: "user",
				timestamp: text.charCodeAt(0),
				content: { parts: [{ text }] },
			} as any);
		}

		const fetched = await service.getSession("app", "user", "s-nre0", {
			numRecentEvents: 0,
		});
		expect(fetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"a",
			"b",
			"c",
			"d",
		]);
	});

	it("propagates structuredClone failures from getSession", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", { a: 1 }, "s-clone");
		const spy = vi
			.spyOn(globalThis, "structuredClone")
			.mockImplementationOnce(() => {
				throw new Error("structuredClone boom");
			});

		await expect(service.getSession("app", "user", "s-clone")).rejects.toThrow(
			/structuredClone boom/,
		);
		spy.mockRestore();
	});

	it("propagates structuredClone failures from createSession copy", async () => {
		const service = new InMemorySessionService();
		const spy = vi
			.spyOn(globalThis, "structuredClone")
			.mockImplementationOnce(() => {
				throw new Error("clone on create");
			});

		await expect(
			service.createSession("app", "user", { x: 1 }, "s-fail"),
		).rejects.toThrow(/clone on create/);
		spy.mockRestore();
		// session is inserted before the return clone; getSession may still resolve
		const leftover = await service.getSession("app", "user", "s-fail");
		expect(leftover?.id).toBe("s-fail");
		expect(leftover?.state).toEqual({ x: 1 });
	});

	it("listSessions clones each session and structuredClone errors abort the list", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "user", {}, "s1");
		await service.createSession("app", "user", {}, "s2");
		const realClone = globalThis.structuredClone.bind(globalThis);
		let calls = 0;
		const spy = vi
			.spyOn(globalThis, "structuredClone")
			.mockImplementation((v) => {
				calls++;
				if (calls === 2) {
					throw new Error("list clone fail");
				}
				return realClone(v);
			});

		await expect(service.listSessions("app", "user")).rejects.toThrow(
			/list clone fail/,
		);
		spy.mockRestore();
	});
});
