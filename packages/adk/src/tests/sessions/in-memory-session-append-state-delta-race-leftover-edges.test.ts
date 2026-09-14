import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { State } from "../../sessions/state";

/**
 * Leftover: concurrent appendEvent with overlapping app:/user: deltas —
 * last-write-wins on maps; all events persist; lastUpdateTime ends at max.
 */
describe("in-memory session append state-delta race leftover edges", () => {
	it("Promise.all overlapping app:/user: deltas last-write-wins", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user", {}, "race-1");

		const makers = (n: number, prefix: "app" | "user", value: string) =>
			new Event({
				id: `e-${prefix}-${n}`,
				author: "agent",
				invocationId: `inv-${n}`,
				timestamp: 1000 + n,
				actions: new EventActions({
					stateDelta: {
						[`${prefix === "app" ? State.APP_PREFIX : State.USER_PREFIX}k`]:
							value,
					},
				}),
			});

		await Promise.all([
			service.appendEvent(session, makers(1, "app", "a1")),
			service.appendEvent(session, makers(2, "app", "a2")),
			service.appendEvent(session, makers(3, "user", "u1")),
			service.appendEvent(session, makers(4, "user", "u2")),
		]);

		const loaded = await service.getSession("app", "user", "race-1");
		expect(loaded!.events).toHaveLength(4);
		expect(loaded!.events.map((e) => e.id).sort()).toEqual([
			"e-app-1",
			"e-app-2",
			"e-user-3",
			"e-user-4",
		]);
		expect([loaded!.state[`${State.APP_PREFIX}k`]]).toContain(
			loaded!.state[`${State.APP_PREFIX}k`],
		);
		expect(["a1", "a2"]).toContain(loaded!.state[`${State.APP_PREFIX}k`]);
		expect(["u1", "u2"]).toContain(loaded!.state[`${State.USER_PREFIX}k`]);
		expect(loaded!.lastUpdateTime).toBe(
			Math.max(...loaded!.events.map((e) => e.timestamp)),
		);
	});

	it("concurrent appends on two session handles sharing storage both persist", async () => {
		const service = new InMemorySessionService();
		const s1 = await service.createSession("app", "user", {}, "race-2");
		const s2 = (await service.getSession("app", "user", "race-2"))!;

		await Promise.all([
			service.appendEvent(
				s1,
				new Event({
					id: "e-a",
					author: "a",
					invocationId: "i1",
					timestamp: 10,
					actions: new EventActions({
						stateDelta: { [`${State.APP_PREFIX}x`]: "from-s1" },
					}),
				}),
			),
			service.appendEvent(
				s2,
				new Event({
					id: "e-b",
					author: "b",
					invocationId: "i2",
					timestamp: 20,
					actions: new EventActions({
						stateDelta: { [`${State.APP_PREFIX}x`]: "from-s2" },
					}),
				}),
			),
		]);

		const loaded = await service.getSession("app", "user", "race-2");
		expect(loaded!.events.map((e) => e.id).sort()).toEqual(["e-a", "e-b"]);
		expect(["from-s1", "from-s2"]).toContain(
			loaded!.state[`${State.APP_PREFIX}x`],
		);
	});

	it("concurrent creates with distinct ids all succeed under race", async () => {
		const service = new InMemorySessionService();
		const ids = await Promise.all(
			Array.from({ length: 12 }, (_, i) =>
				service.createSession("app", "user", { i }, `id-${i}`),
			),
		);
		expect(new Set(ids.map((s) => s.id)).size).toBe(12);
		const listed = await service.listSessions("app", "user");
		expect(listed.sessions).toHaveLength(12);
	});

	it("lazy-init maps under concurrent first app:/user: writes", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app2", "user2", {}, "race-3");
		await Promise.all(
			Array.from({ length: 8 }, (_, i) =>
				service.appendEvent(
					session,
					new Event({
						id: `e${i}`,
						author: "a",
						invocationId: `i${i}`,
						timestamp: i,
						actions: new EventActions({
							stateDelta: {
								[`${State.APP_PREFIX}k${i}`]: i,
								[`${State.USER_PREFIX}u${i}`]: i,
							},
						}),
					}),
				),
			),
		);
		const loaded = await service.getSession("app2", "user2", "race-3");
		expect(loaded!.events).toHaveLength(8);
		for (let i = 0; i < 8; i++) {
			expect(loaded!.state[`${State.APP_PREFIX}k${i}`]).toBe(i);
			expect(loaded!.state[`${State.USER_PREFIX}u${i}`]).toBe(i);
		}
	});
});
