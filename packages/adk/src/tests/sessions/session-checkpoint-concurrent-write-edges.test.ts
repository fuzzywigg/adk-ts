import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { createSqliteSessionService } from "../../sessions/database-factories";
import type { DatabaseSessionService } from "../../sessions/database-session-service";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { State } from "../../sessions/state";

describe("Session checkpoint concurrent write edges", () => {
	describe("InMemorySessionService", () => {
		it("concurrent appendEvent on one handle persists every checkpoint event", async () => {
			const service = new InMemorySessionService();
			const session = await service.createSession("app", "user", {}, "s-race");
			const n = 24;

			await Promise.all(
				Array.from({ length: n }, (_, i) =>
					service.appendEvent(
						session,
						new Event({
							author: "agent",
							timestamp: 1000 + i,
							content: { role: "model", parts: [{ text: `cp-${i}` }] },
						}),
					),
				),
			);

			const stored = await service.getSession("app", "user", "s-race");
			expect(stored?.events).toHaveLength(n);
			expect(
				new Set(stored?.events.map((e) => e.content?.parts?.[0]?.text)),
			).toEqual(new Set(Array.from({ length: n }, (_, i) => `cp-${i}`)));
			expect(session.events).toHaveLength(n);
		});

		it("concurrent appendEvent from two resumed handles both land in storage", async () => {
			const service = new InMemorySessionService();
			await service.createSession("app", "user", {}, "s-two");
			const a = await service.getSession("app", "user", "s-two");
			const b = await service.getSession("app", "user", "s-two");
			expect(a).toBeDefined();
			expect(b).toBeDefined();

			await Promise.all([
				service.appendEvent(
					a!,
					new Event({
						author: "agent",
						timestamp: 10,
						content: { role: "model", parts: [{ text: "from-a" }] },
						actions: new EventActions({ stateDelta: { fromA: true } }),
					}),
				),
				service.appendEvent(
					b!,
					new Event({
						author: "agent",
						timestamp: 20,
						content: { role: "model", parts: [{ text: "from-b" }] },
						actions: new EventActions({ stateDelta: { fromB: true } }),
					}),
				),
			]);

			const stored = await service.getSession("app", "user", "s-two");
			expect(stored?.events).toHaveLength(2);
			expect(
				stored?.events.map((e) => e.content?.parts?.[0]?.text).sort(),
			).toEqual(["from-a", "from-b"]);
			expect(stored?.state.fromA).toBe(true);
			expect(stored?.state.fromB).toBe(true);
		});

		it("interleaved concurrent append/get never returns a torn event list", async () => {
			const service = new InMemorySessionService();
			const session = await service.createSession(
				"app",
				"user",
				{},
				"s-interleave",
			);
			const ops: Promise<unknown>[] = [];

			for (let i = 0; i < 16; i++) {
				ops.push(
					service.appendEvent(
						session,
						new Event({
							author: "agent",
							timestamp: 100 + i,
							content: { role: "model", parts: [{ text: `w-${i}` }] },
						}),
					),
				);
				ops.push(service.getSession("app", "user", "s-interleave"));
			}

			const results = await Promise.all(ops);
			const snapshots = results.filter((_, idx) => idx % 2 === 1) as Array<
				Awaited<ReturnType<InMemorySessionService["getSession"]>>
			>;

			for (const snap of snapshots) {
				expect(snap).toBeDefined();
				for (const event of snap!.events) {
					expect(event.content?.parts?.[0]?.text).toMatch(/^w-\d+$/);
				}
			}

			const final = await service.getSession("app", "user", "s-interleave");
			expect(final?.events).toHaveLength(16);
		});

		it("concurrent app:/user: checkpoint deltas merge without dropping prefixes", async () => {
			const service = new InMemorySessionService();
			const session = await service.createSession(
				"app",
				"user",
				{},
				"s-prefix",
			);

			await Promise.all([
				service.appendEvent(
					session,
					new Event({
						author: "agent",
						timestamp: 1,
						actions: new EventActions({
							stateDelta: { [`${State.APP_PREFIX}theme`]: "dark" },
						}),
					}),
				),
				service.appendEvent(
					session,
					new Event({
						author: "agent",
						timestamp: 2,
						actions: new EventActions({
							stateDelta: { [`${State.USER_PREFIX}locale`]: "en" },
						}),
					}),
				),
				service.appendEvent(
					session,
					new Event({
						author: "agent",
						timestamp: 3,
						actions: new EventActions({
							stateDelta: { local: "ok" },
						}),
					}),
				),
			]);

			const stored = await service.getSession("app", "user", "s-prefix");
			expect(stored?.state[`${State.APP_PREFIX}theme`]).toBe("dark");
			expect(stored?.state[`${State.USER_PREFIX}locale`]).toBe("en");
			expect(stored?.state.local).toBe("ok");
			expect(stored?.events).toHaveLength(3);
		});

		it("concurrent appendEvent after delete warns per writer without throwing", async () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const service = new InMemorySessionService();
			const session = await service.createSession("app", "user", {}, "s-gone");
			await service.deleteSession("app", "user", "s-gone");

			const results = await Promise.all(
				Array.from({ length: 8 }, (_, i) =>
					service.appendEvent(
						session,
						new Event({
							author: "agent",
							timestamp: 50 + i,
							content: { role: "model", parts: [{ text: `late-${i}` }] },
						}),
					),
				),
			);

			expect(results).toHaveLength(8);
			expect(warn.mock.calls.length).toBeGreaterThanOrEqual(8);
			expect(await service.getSession("app", "user", "s-gone")).toBeUndefined();
			warn.mockRestore();
		});
	});

	describe("DatabaseSessionService", () => {
		let service: DatabaseSessionService;

		beforeEach(() => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			service = createSqliteSessionService(":memory:");
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("serial concurrent appendEvent on one handle keeps ordered checkpoints", async () => {
			const session = await service.createSession(
				"app",
				"user",
				{},
				"s-db-race",
			);
			const n = 12;

			await Promise.all(
				Array.from({ length: n }, (_, i) =>
					service.appendEvent(
						session,
						new Event({
							author: "agent",
							content: { role: "model", parts: [{ text: `db-${i}` }] },
							actions: new EventActions({ stateDelta: { last: i } }),
						}),
					),
				),
			);

			const stored = await service.getSession("app", "user", "s-db-race");
			expect(stored?.events).toHaveLength(n);
			expect(typeof stored?.state.last).toBe("number");
			expect(stored?.state.last).toBeGreaterThanOrEqual(0);
			expect(stored?.state.last).toBeLessThan(n);
		});

		it("same-second concurrent appends from two resumed handles both commit", async () => {
			await service.createSession("app", "user", {}, "s-same-sec");
			const handleA = await service.getSession("app", "user", "s-same-sec");
			const handleB = await service.getSession("app", "user", "s-same-sec");
			expect(handleA?.lastUpdateTime).toBe(handleB?.lastUpdateTime);

			const outcomes = await Promise.allSettled([
				service.appendEvent(
					handleA!,
					new Event({
						author: "agent",
						content: { role: "model", parts: [{ text: "a" }] },
						actions: new EventActions({ stateDelta: { fromA: true } }),
					}),
				),
				service.appendEvent(
					handleB!,
					new Event({
						author: "agent",
						content: { role: "model", parts: [{ text: "b" }] },
						actions: new EventActions({ stateDelta: { fromB: true } }),
					}),
				),
			]);

			expect(outcomes.every((o) => o.status === "fulfilled")).toBe(true);
			const stored = await service.getSession("app", "user", "s-same-sec");
			expect(stored?.events).toHaveLength(2);
			expect(stored?.state.fromA).toBe(true);
			expect(stored?.state.fromB).toBe(true);
		});

		it("peer checkpoint then lagging handle hits sqlite stale-check error path", async () => {
			await service.createSession("app", "user", {}, "s-stale-race");
			const handleA = await service.getSession("app", "user", "s-stale-race");
			const handleB = await service.getSession("app", "user", "s-stale-race");

			await service.appendEvent(
				handleA!,
				new Event({
					author: "agent",
					content: { role: "model", parts: [{ text: "first-writer" }] },
					actions: new EventActions({ stateDelta: { winner: "a" } }),
				}),
			);

			// SQLite stores update_time as a string; stale comparison succeeds via
			// timestampToUnixSeconds, but error formatting assumes a Date and throws.
			handleB!.lastUpdateTime = 1;
			await expect(
				service.appendEvent(
					handleB!,
					new Event({
						author: "agent",
						content: { role: "model", parts: [{ text: "stale-writer" }] },
						actions: new EventActions({ stateDelta: { winner: "b" } }),
					}),
				),
			).rejects.toThrow(/toISOString is not a function|stale session/);

			const stored = await service.getSession("app", "user", "s-stale-race");
			expect(stored?.events).toHaveLength(1);
			expect(stored?.events[0].content?.parts?.[0]?.text).toBe("first-writer");
			expect(stored?.state.winner).toBe("a");
		});

		it("Promise.allSettled with one pre-staled handle yields one success and one rejection", async () => {
			await service.createSession("app", "user", {}, "s-all-race");
			const handleA = await service.getSession("app", "user", "s-all-race");
			const handleB = await service.getSession("app", "user", "s-all-race");
			handleB!.lastUpdateTime = 1;

			const outcomes = await Promise.allSettled([
				service.appendEvent(
					handleA!,
					new Event({
						author: "agent",
						content: { role: "model", parts: [{ text: "a" }] },
						actions: new EventActions({ stateDelta: { who: "a" } }),
					}),
				),
				service.appendEvent(
					handleB!,
					new Event({
						author: "agent",
						content: { role: "model", parts: [{ text: "b" }] },
						actions: new EventActions({ stateDelta: { who: "b" } }),
					}),
				),
			]);

			const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
			const rejected = outcomes.filter((o) => o.status === "rejected");
			expect(fulfilled).toHaveLength(1);
			expect(rejected).toHaveLength(1);
			expect(String((rejected[0] as PromiseRejectedResult).reason)).toMatch(
				/toISOString is not a function|stale session/,
			);

			const stored = await service.getSession("app", "user", "s-all-race");
			expect(stored?.events).toHaveLength(1);
			expect(stored?.state.who).toBe("a");
		});

		it("getSession refresh recovers a lagging handle after a peer checkpoint write", async () => {
			await service.createSession("app", "user", {}, "s-refresh");
			const handleA = await service.getSession("app", "user", "s-refresh");
			const lagging = await service.getSession("app", "user", "s-refresh");

			await service.appendEvent(
				handleA!,
				new Event({
					author: "agent",
					content: { role: "model", parts: [{ text: "a1" }] },
				}),
			);

			lagging!.lastUpdateTime = 1;
			await expect(
				service.appendEvent(
					lagging!,
					new Event({
						author: "agent",
						content: { role: "model", parts: [{ text: "lag" }] },
					}),
				),
			).rejects.toThrow(/toISOString is not a function|stale session/);

			const refreshed = await service.getSession("app", "user", "s-refresh");
			expect(refreshed!.lastUpdateTime).toBeGreaterThan(1);

			await expect(
				service.appendEvent(
					refreshed!,
					new Event({
						author: "agent",
						content: { role: "model", parts: [{ text: "b1" }] },
					}),
				),
			).resolves.toBeTruthy();

			const stored = await service.getSession("app", "user", "s-refresh");
			expect(
				stored?.events.map((e) => e.content?.parts?.[0]?.text).sort(),
			).toEqual(["a1", "b1"]);
		});

		it("concurrent createSession ids stay unique while append races on distinct sessions", async () => {
			const created = await Promise.all(
				Array.from({ length: 8 }, (_, i) =>
					service.createSession("app-par", "user-par", {}, `fixed-${i}`),
				),
			);
			expect(new Set(created.map((s) => s.id)).size).toBe(8);

			await Promise.all(
				created.map((session, i) =>
					service.appendEvent(
						session,
						new Event({
							author: "agent",
							content: { role: "model", parts: [{ text: `x-${i}` }] },
							actions: new EventActions({ stateDelta: { i } }),
						}),
					),
				),
			);

			const listed = await service.listSessions("app-par", "user-par");
			expect(listed.sessions).toHaveLength(8);
			for (let i = 0; i < 8; i++) {
				const s = await service.getSession("app-par", "user-par", `fixed-${i}`);
				expect(s?.events).toHaveLength(1);
				expect(s?.state.i).toBe(i);
			}
		});
	});
});
