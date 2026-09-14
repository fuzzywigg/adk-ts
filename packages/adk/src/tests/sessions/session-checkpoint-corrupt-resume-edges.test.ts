import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { createSqliteSessionService } from "../../sessions/database-factories";
import type { DatabaseSessionService } from "../../sessions/database-session-service";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { State } from "../../sessions/state";

describe("Session checkpoint corrupt + partial resume edges", () => {
	describe("DatabaseSessionService corrupt checkpoint stubs", () => {
		let service: DatabaseSessionService;

		beforeEach(() => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			service = createSqliteSessionService(":memory:");
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("getSession recovers corrupt app_states and user_states JSON to empty maps", async () => {
			const session = await service.createSession(
				"app",
				"user",
				{
					[`${State.APP_PREFIX}theme`]: "dark",
					[`${State.USER_PREFIX}locale`]: "en",
					local: 1,
				},
				"s-corrupt-states",
			);
			expect(session.state[`${State.APP_PREFIX}theme`]).toBe("dark");

			const db = (service as any).db;
			await db
				.updateTable("app_states")
				.set({ state: "{not-json" })
				.where("app_name", "=", "app")
				.execute();
			await db
				.updateTable("user_states")
				.set({ state: "nope" })
				.where("app_name", "=", "app")
				.where("user_id", "=", "user")
				.execute();

			const fetched = await service.getSession(
				"app",
				"user",
				"s-corrupt-states",
			);
			expect(fetched?.id).toBe("s-corrupt-states");
			expect(fetched?.state[`${State.APP_PREFIX}theme`]).toBeUndefined();
			expect(fetched?.state[`${State.USER_PREFIX}locale`]).toBeUndefined();
			expect(fetched?.state.local).toBe(1);
		});

		it("appendEvent recovers corrupt session/app/user JSON then merges new deltas", async () => {
			const session = await service.createSession(
				"app",
				"user",
				{ seed: true },
				"s-corrupt-append",
			);
			const db = (service as any).db;
			await db
				.updateTable("sessions")
				.set({ state: "{bad-session" })
				.where("id", "=", "s-corrupt-append")
				.execute();
			await db
				.updateTable("app_states")
				.set({ state: "{bad-app" })
				.where("app_name", "=", "app")
				.execute();
			await db
				.updateTable("user_states")
				.set({ state: "{bad-user" })
				.where("app_name", "=", "app")
				.where("user_id", "=", "user")
				.execute();

			const fresh = await service.getSession("app", "user", "s-corrupt-append");
			expect(fresh?.state.seed).toBeUndefined();

			await service.appendEvent(
				fresh!,
				new Event({
					author: "agent",
					content: { role: "model", parts: [{ text: "repaired" }] },
					actions: new EventActions({
						stateDelta: {
							[`${State.APP_PREFIX}flag`]: true,
							[`${State.USER_PREFIX}pref`]: "x",
							local: "ok",
						},
					}),
				}),
			);

			const after = await service.getSession("app", "user", "s-corrupt-append");
			expect(after?.events).toHaveLength(1);
			expect(after?.events[0].content?.parts?.[0]?.text).toBe("repaired");
			expect(after?.state[`${State.APP_PREFIX}flag`]).toBe(true);
			expect(after?.state[`${State.USER_PREFIX}pref`]).toBe("x");
			expect(after?.state.local).toBe("ok");
		});

		it("getSession recovers mixed corrupt event columns while keeping valid siblings", async () => {
			const session = await service.createSession(
				"app",
				"user",
				{},
				"s-mixed-evt",
			);
			await service.appendEvent(
				session,
				new Event({
					id: "good",
					author: "agent",
					content: { role: "model", parts: [{ text: "good" }] },
					actions: new EventActions({ escalate: true }),
				}),
			);
			await service.appendEvent(
				session,
				new Event({
					id: "bad",
					author: "agent",
					content: { role: "model", parts: [{ text: "will-corrupt" }] },
				}),
			);

			const db = (service as any).db;
			await db
				.updateTable("events")
				.set({
					content: "{broken",
					actions: "not-json",
					grounding_metadata: "{x",
					long_running_tool_ids_json: "[]",
				})
				.where("id", "=", "bad")
				.execute();

			const fetched = await service.getSession("app", "user", "s-mixed-evt");
			expect(fetched?.events).toHaveLength(2);
			const byId = Object.fromEntries(fetched!.events.map((e) => [e.id, e]));
			expect(byId.good.content?.parts?.[0]?.text).toBe("good");
			expect(byId.good.actions?.escalate).toBe(true);
			expect(byId.bad.content).toBeNull();
			expect(byId.bad.actions).toBeNull();
		});

		it("storageEventToEvent falsy stubs skip parse; whitespace corrupt payloads default", () => {
			const convert = (service as any).storageEventToEvent.bind(service);
			const emptyFalsy = convert({
				id: "e-empty",
				invocation_id: "inv",
				author: "agent",
				timestamp: new Date("2024-01-01T00:00:00.000Z"),
				content: "",
				actions: "",
				long_running_tool_ids_json: "",
				grounding_metadata: "",
				partial: null,
				turn_complete: null,
				error_code: null,
				error_message: null,
				interrupted: null,
				branch: null,
			});
			expect(emptyFalsy.content).toBeUndefined();
			expect(emptyFalsy.actions).toBeUndefined();
			expect(emptyFalsy.longRunningToolIds).toBeUndefined();
			expect(emptyFalsy.groundingMetadata).toBeUndefined();

			const whitespaceCorrupt = convert({
				id: "e-ws",
				invocation_id: "inv",
				author: "agent",
				timestamp: new Date("2024-01-01T00:00:00.000Z"),
				content: "   ",
				actions: "\n{",
				long_running_tool_ids_json: "  {",
				grounding_metadata: "\n",
				partial: null,
				turn_complete: null,
				error_code: null,
				error_message: null,
				interrupted: null,
				branch: null,
			});
			expect(whitespaceCorrupt.content).toBeNull();
			expect(whitespaceCorrupt.actions).toBeNull();
			expect(whitespaceCorrupt.longRunningToolIds).toEqual(new Set());
			expect(whitespaceCorrupt.groundingMetadata).toBeNull();
		});
	});

	describe("DatabaseSessionService partial resume", () => {
		let service: DatabaseSessionService;

		beforeEach(() => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			service = createSqliteSessionService(":memory:");
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("partial checkpoints are skipped so resume only sees committed events", async () => {
			const session = await service.createSession(
				"app",
				"user",
				{},
				"s-partial-resume",
			);
			const before = session.lastUpdateTime;

			await service.appendEvent(
				session,
				new Event({
					author: "agent",
					partial: true,
					content: { role: "model", parts: [{ text: "stream-chunk" }] },
					actions: new EventActions({ stateDelta: { streamed: true } }),
				}),
			);
			expect(session.events).toHaveLength(0);
			expect(session.lastUpdateTime).toBe(before);
			expect(session.state.streamed).toBeUndefined();

			await service.appendEvent(
				session,
				new Event({
					author: "agent",
					content: { role: "model", parts: [{ text: "final" }] },
					actions: new EventActions({ stateDelta: { committed: true } }),
				}),
			);

			const resumed = await service.getSession(
				"app",
				"user",
				"s-partial-resume",
			);
			expect(resumed?.events).toHaveLength(1);
			expect(resumed?.events[0].content?.parts?.[0]?.text).toBe("final");
			expect(resumed?.state.committed).toBe(true);
			expect(resumed?.state.streamed).toBeUndefined();
		});

		it("interleaved partial then commit checkpoints resume with only commits", async () => {
			const session = await service.createSession(
				"app",
				"user",
				{},
				"s-interleave-partial",
			);

			for (let i = 0; i < 5; i++) {
				await service.appendEvent(
					session,
					new Event({
						author: "agent",
						partial: true,
						content: {
							role: "model",
							parts: [{ text: `partial-${i}` }],
						},
					}),
				);
				await service.appendEvent(
					session,
					new Event({
						author: "agent",
						content: { role: "model", parts: [{ text: `commit-${i}` }] },
						actions: new EventActions({ stateDelta: { step: i } }),
					}),
				);
			}

			const resumed = await service.getSession(
				"app",
				"user",
				"s-interleave-partial",
			);
			expect(resumed?.events).toHaveLength(5);
			expect(
				resumed?.events.map((e) => e.content?.parts?.[0]?.text).sort(),
			).toEqual(["commit-0", "commit-1", "commit-2", "commit-3", "commit-4"]);
			expect(resumed?.state.step).toBe(4);
		});

		it("numRecentEvents resume window returns a truncated checkpoint history", async () => {
			const session = await service.createSession(
				"app",
				"user",
				{},
				"s-window",
			);
			for (let i = 0; i < 6; i++) {
				await service.appendEvent(
					session,
					new Event({
						author: "agent",
						content: { role: "model", parts: [{ text: `e-${i}` }] },
					}),
				);
			}

			const windowed = await service.getSession("app", "user", "s-window", {
				numRecentEvents: 2,
			});
			expect(windowed?.events).toHaveLength(2);
			expect(
				windowed?.events.every((e) =>
					String(e.content?.parts?.[0]?.text).startsWith("e-"),
				),
			).toBe(true);

			const full = await service.getSession("app", "user", "s-window");
			expect(full?.events).toHaveLength(6);
		});

		it("resume after delete yields undefined until a new checkpoint session is created", async () => {
			await service.createSession("app", "user", { a: 1 }, "s-del");
			await service.deleteSession("app", "user", "s-del");
			expect(await service.getSession("app", "user", "s-del")).toBeUndefined();

			const recreated = await service.createSession(
				"app",
				"user",
				{ a: 2 },
				"s-del",
			);
			await service.appendEvent(
				recreated,
				new Event({
					author: "agent",
					content: { role: "model", parts: [{ text: "fresh" }] },
				}),
			);
			const resumed = await service.getSession("app", "user", "s-del");
			expect(resumed?.state.a).toBe(2);
			expect(resumed?.events).toHaveLength(1);
		});
	});

	describe("InMemorySessionService partial resume + snapshot edges", () => {
		it("partial stream chunks do not enter storage; final commit is resumable", async () => {
			const service = new InMemorySessionService();
			const session = await service.createSession(
				"app",
				"user",
				{},
				"s-stream",
			);

			for (const chunk of ["Hel", "lo", "!"]) {
				await service.appendEvent(
					session,
					new Event({
						author: "agent",
						partial: true,
						timestamp: 1,
						content: { role: "model", parts: [{ text: chunk }] },
					}),
				);
			}
			expect(session.events).toHaveLength(0);

			await service.appendEvent(
				session,
				new Event({
					author: "agent",
					timestamp: 2,
					content: { role: "model", parts: [{ text: "Hello!" }] },
					actions: new EventActions({ stateDelta: { done: true } }),
				}),
			);

			const resumed = await service.getSession("app", "user", "s-stream");
			expect(resumed?.events).toHaveLength(1);
			expect(resumed?.events[0].content?.parts?.[0]?.text).toBe("Hello!");
			expect(resumed?.state.done).toBe(true);
		});

		it("partial resume via afterTimestamp keeps only post-boundary checkpoints", async () => {
			const service = new InMemorySessionService();
			const session = await service.createSession("app", "user", {}, "s-after");
			for (const ts of [10, 20, 30, 40]) {
				await service.appendEvent(
					session,
					new Event({
						author: "agent",
						timestamp: ts,
						content: { role: "model", parts: [{ text: `t-${ts}` }] },
					}),
				);
			}

			const resumed = await service.getSession("app", "user", "s-after", {
				afterTimestamp: 25,
			});
			expect(resumed?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
				"t-30",
				"t-40",
			]);
		});

		it("numRecentEvents then afterTimestamp composes a partial resume window", async () => {
			const service = new InMemorySessionService();
			const session = await service.createSession(
				"app",
				"user",
				{},
				"s-compose",
			);
			for (const ts of [100, 200, 300, 400, 500]) {
				await service.appendEvent(
					session,
					new Event({
						author: "user",
						timestamp: ts,
						content: { role: "user", parts: [{ text: `e-${ts}` }] },
					}),
				);
			}

			const resumed = await service.getSession("app", "user", "s-compose", {
				numRecentEvents: 3,
				afterTimestamp: 250,
			});
			expect(resumed?.events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
				"e-300",
				"e-400",
				"e-500",
			]);
		});

		it("resumed snapshot is isolated from later checkpoint writes on the live handle", async () => {
			const service = new InMemorySessionService();
			const live = await service.createSession("app", "user", {}, "s-iso");
			await service.appendEvent(
				live,
				new Event({
					author: "agent",
					timestamp: 1,
					content: { role: "model", parts: [{ text: "one" }] },
					actions: new EventActions({ stateDelta: { n: 1 } }),
				}),
			);

			const snapshot = await service.getSession("app", "user", "s-iso");
			await service.appendEvent(
				live,
				new Event({
					author: "agent",
					timestamp: 2,
					content: { role: "model", parts: [{ text: "two" }] },
					actions: new EventActions({ stateDelta: { n: 2 } }),
				}),
			);

			expect(snapshot?.events).toHaveLength(1);
			expect(snapshot?.state.n).toBe(1);

			const resumed = await service.getSession("app", "user", "s-iso");
			expect(resumed?.events).toHaveLength(2);
			expect(resumed?.state.n).toBe(2);
		});

		it("partial event still advances caller lastUpdateTime before a commit resume", async () => {
			const service = new InMemorySessionService();
			const session = await service.createSession(
				"app",
				"user",
				{},
				"s-partial-ts",
			);
			const createdAt = session.lastUpdateTime;

			await service.appendEvent(
				session,
				new Event({
					author: "agent",
					partial: true,
					timestamp: createdAt + 100,
					content: { role: "model", parts: [{ text: "chunk" }] },
				}),
			);
			expect(session.lastUpdateTime).toBe(createdAt + 100);

			const mid = await service.getSession("app", "user", "s-partial-ts");
			expect(mid?.events).toHaveLength(0);
			expect(mid?.lastUpdateTime).toBe(createdAt + 100);

			await service.appendEvent(
				session,
				new Event({
					author: "agent",
					timestamp: createdAt + 200,
					content: { role: "model", parts: [{ text: "done" }] },
				}),
			);
			const resumed = await service.getSession("app", "user", "s-partial-ts");
			expect(resumed?.events).toHaveLength(1);
			expect(resumed?.lastUpdateTime).toBe(createdAt + 200);
		});
	});
});
