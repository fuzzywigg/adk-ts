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

describe("InMemorySessionService leftover warn paths and filter composition", () => {
	it("warns when appName is absent from the sessions map on append", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = new InMemorySessionService();
		const session = {
			appName: "ghost-app",
			userId: "u",
			id: "s1",
			state: {},
			events: [] as any[],
			lastUpdateTime: 0,
		};

		const event = {
			author: "agent",
			timestamp: 11,
			content: { parts: [{ text: "late" }] },
		} as any;

		await expect(service.appendEvent(session as any, event)).resolves.toBe(
			event,
		);
		expect(session.events).toHaveLength(1);
		expect(session.lastUpdateTime).toBe(11);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("appName ghost-app not in sessions"),
		);
		warn.mockRestore();
	});

	it("warns when userId is missing under an existing app on append", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = new InMemorySessionService();
		await service.createSession("shared-app", "other-user", {}, "s-other");

		const session = {
			appName: "shared-app",
			userId: "missing-user",
			id: "s1",
			state: {},
			events: [] as any[],
			lastUpdateTime: 0,
		};
		const event = {
			author: "agent",
			timestamp: 22,
			content: { parts: [{ text: "x" }] },
		} as any;

		await expect(service.appendEvent(session as any, event)).resolves.toBe(
			event,
		);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("userId missing-user not in sessions[appName]"),
		);
		warn.mockRestore();
	});

	it("applies numRecentEvents before afterTimestamp when both are set", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s-combo");
		for (const [ts, text] of [
			[100, "a"],
			[200, "b"],
			[300, "c"],
			[400, "d"],
		] as const) {
			await service.appendEvent(session, {
				author: "user",
				timestamp: ts,
				content: { parts: [{ text }] },
			} as any);
		}

		const fetched = await service.getSession("app", "user", "s-combo", {
			numRecentEvents: 3,
			afterTimestamp: 250,
		});
		expect(fetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"c",
			"d",
		]);
	});

	it("afterTimestamp keeps the full sliced window when every event is newer", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "s-new");
		await service.appendEvent(session, {
			author: "user",
			timestamp: 50,
			content: { parts: [{ text: "x" }] },
		} as any);
		await service.appendEvent(session, {
			author: "user",
			timestamp: 60,
			content: { parts: [{ text: "y" }] },
		} as any);

		const fetched = await service.getSession("app", "user", "s-new", {
			afterTimestamp: 10,
		});
		expect(fetched?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"x",
			"y",
		]);
	});

	it("trims blank sessionId to a generated UUID", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "   ");
		expect(session.id).not.toMatch(/^\s*$/);
		expect(session.id.length).toBeGreaterThan(8);
	});

	it("merges app state even when the user has no userState map yet", async () => {
		const service = new InMemorySessionService();
		const first = await service.createSession("theme-app", "u1", {}, "s1");
		await service.appendEvent(first, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: { [`${State.APP_PREFIX}theme`]: "dark" },
			},
		} as any);

		const second = await service.createSession("theme-app", "u2", {}, "s2");
		expect(second.state[`${State.APP_PREFIX}theme`]).toBe("dark");
		expect((service as any).userState.get("theme-app")?.has("u2")).toBeFalsy();
	});

	it("TEMP_PREFIX deltas skip app/user maps but still land in session state", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession(
			"tmp-app",
			"tmp-user",
			{},
			"s1",
		);
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: { [`${State.TEMP_PREFIX}scratch`]: "ephemeral" },
			},
		} as any);

		expect((service as any).appState.has("tmp-app")).toBe(false);
		expect((service as any).userState.has("tmp-app")).toBe(false);
		// BaseSessionService only skips temp_ keys, not temp: (TEMP_PREFIX).
		expect(session.state[`${State.TEMP_PREFIX}scratch`]).toBe("ephemeral");
	});

	it("listSessions is empty for a known app with an unknown user", async () => {
		const service = new InMemorySessionService();
		await service.createSession("app", "known", {}, "s1");
		await expect(service.listSessions("app", "unknown")).resolves.toEqual({
			sessions: [],
		});
	});

	it("createSession with undefined state yields an empty state object", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", undefined, "s0");
		expect(session.state).toEqual({});
	});

	it("appendEvent with an empty stateDelta object is a no-op for maps", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("empty-delta", "u", {}, "s1");
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 1,
			actions: { stateDelta: {} },
			content: { parts: [{ text: "ok" }] },
		} as any);

		expect((service as any).appState.has("empty-delta")).toBe(false);
		expect((service as any).userState.has("empty-delta")).toBe(false);
		expect(
			(await service.getSession("empty-delta", "u", "s1"))?.events,
		).toHaveLength(1);
	});
});
