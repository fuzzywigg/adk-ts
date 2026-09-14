import { describe, expect, it, vi } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { State } from "../../sessions/state";

/**
 * Leftover: createSessionImpl uses `state || {}` — falsy state args
 * (null / 0 / false / "") coalesce to {}, unlike a truthy empty object.
 * Also pads mergeState early-return and append warning divergences.
 */
describe("InMemorySessionService state coalesce leftover edges", () => {
	it.each([
		["null", null],
		["0", 0],
		["false", false],
		['""', ""],
	] as const)("createSession with falsy state (%s) coalesces to {}", async (_label, falsyState) => {
		const service = new InMemorySessionService();
		const session = await service.createSession(
			"app",
			"user",
			falsyState as unknown as Record<string, any>,
			`s-${_label}`,
		);
		expect(session.state).toEqual({});
		expect(session.state).not.toBe(falsyState as unknown as object);
	});

	it("createSession with omitted state also yields {}", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "user");
		expect(session.state).toEqual({});
	});

	it("createSession with truthy empty object keeps the same reference shape {}", async () => {
		const service = new InMemorySessionService();
		const empty = {};
		const session = await service.createSession(
			"app",
			"user",
			empty,
			"s-empty",
		);
		expect(session.state).toEqual({});
	});

	it("createSessionSync also coalesces falsy state via shared impl", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = new InMemorySessionService();
		const session = service.createSessionSync(
			"app",
			"user",
			null as unknown as Record<string, any>,
			"sync-null",
		);
		expect(session.state).toEqual({});
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("mergeState early-returns with app keys only when user map is missing", async () => {
		const service = new InMemorySessionService();
		const first = await service.createSession("app", "u1", {}, "s1");
		await service.appendEvent(first, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: { [`${State.APP_PREFIX}only`]: "app-val" },
			},
		} as any);

		const second = await service.createSession(
			"app",
			"u2-no-user-state",
			{},
			"s2",
		);
		expect(second.state[`${State.APP_PREFIX}only`]).toBe("app-val");
		expect(
			Object.keys(second.state).some((k) => k.startsWith(State.USER_PREFIX)),
		).toBe(false);
	});

	it("stores null app:/user: values into maps (unlike Base nullish delete)", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession(
			"app",
			"user",
			{ keep: 1 },
			"s-nullish",
		);
		await service.appendEvent(session, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}gone`]: null,
					[`${State.USER_PREFIX}gone`]: null,
					keep: null,
				},
			},
		} as any);

		expect((service as any).appState.get("app").get("gone")).toBeNull();
		expect(
			(service as any).userState.get("app").get("user").get("gone"),
		).toBeNull();
		const fetched = await service.getSession("app", "user", "s-nullish");
		expect(fetched?.state[`${State.APP_PREFIX}gone`]).toBeNull();
		expect(fetched?.state[`${State.USER_PREFIX}gone`]).toBeNull();
	});

	it("warns when appName missing from storage map on append", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = new InMemorySessionService();
		const orphan = {
			appName: "ghost-app",
			userId: "u",
			id: "s",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};
		const event = {
			author: "agent",
			timestamp: 3,
			content: { parts: [{ text: "x" }] },
		} as any;
		await expect(service.appendEvent(orphan as any, event)).resolves.toBe(
			event,
		);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("appName ghost-app not in sessions"),
		);
		warn.mockRestore();
	});

	it("warns when userId missing under existing appName", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const service = new InMemorySessionService();
		await service.createSession("app", "real-user", {}, "s1");
		const orphan = {
			appName: "app",
			userId: "missing-user",
			id: "s1",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};
		await service.appendEvent(
			orphan as any,
			{
				author: "agent",
				timestamp: 1,
				content: { parts: [{ text: "x" }] },
			} as any,
		);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("userId missing-user not in sessions"),
		);
		warn.mockRestore();
	});

	it("both APP and USER prefixes in one delta lazy-init both maps", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("fresh", "u", {}, "s1");
		expect((service as any).appState.has("fresh")).toBe(false);
		expect((service as any).userState.has("fresh")).toBe(false);

		await service.appendEvent(session, {
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}a`]: 1,
					[`${State.USER_PREFIX}b`]: 2,
				},
			},
		} as any);

		expect((service as any).appState.get("fresh").get("a")).toBe(1);
		expect((service as any).userState.get("fresh").get("u").get("b")).toBe(2);
	});

	it("listSessions empty for missing app; delete no-op for missing app", async () => {
		const service = new InMemorySessionService();
		expect((await service.listSessions("nope", "u")).sessions).toEqual([]);
		await expect(
			service.deleteSession("nope", "u", "s"),
		).resolves.toBeUndefined();
	});

	it("whitespace sessionId coalesces via trim || uuid", async () => {
		const service = new InMemorySessionService();
		const a = await service.createSession("app", "user", { x: 1 }, "\t\n  ");
		expect(a.id.trim().length).toBeGreaterThan(0);
		expect(a.id).not.toMatch(/^\s+$/);
		expect(a.state).toEqual({ x: 1 });
	});

	it("undefined sessionId generates uuid", async () => {
		const service = new InMemorySessionService();
		const a = await service.createSession("app", "user", { y: 2 }, undefined);
		expect(a.id).toBeTruthy();
		expect(a.state.y).toBe(2);
	});
});
