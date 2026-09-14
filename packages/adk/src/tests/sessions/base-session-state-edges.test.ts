import { describe, expect, it } from "vitest";
import type { Event } from "../../events/event";
import { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";
import { State } from "../../sessions/state";

class StubSessionService extends BaseSessionService {
	private store = new Map<string, Session>();

	async createSession(
		appName: string,
		userId: string,
		state?: Record<string, any>,
		sessionId?: string,
	): Promise<Session> {
		const id = sessionId ?? "s1";
		const session: Session = {
			id,
			appName,
			userId,
			state: { ...(state ?? {}) },
			events: [],
			lastUpdateTime: 0,
		};
		this.store.set(`${appName}/${userId}/${id}`, session);
		return session;
	}

	async getSession(
		appName: string,
		userId: string,
		sessionId: string,
	): Promise<Session | undefined> {
		return this.store.get(`${appName}/${userId}/${sessionId}`);
	}

	async listSessions(appName: string, userId: string) {
		const sessions = [...this.store.values()].filter(
			(s) => s.appName === appName && s.userId === userId,
		);
		return { sessions };
	}

	async deleteSession(
		appName: string,
		userId: string,
		sessionId: string,
	): Promise<void> {
		this.store.delete(`${appName}/${userId}/${sessionId}`);
	}
}

describe("BaseSessionService leftover edges (post #113)", () => {
	it("ignores inherited stateDelta keys via Object.hasOwn", async () => {
		const service = new StubSessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		const proto = { inherited: "nope" };
		const stateDelta = Object.create(proto) as Record<string, unknown>;
		stateDelta.own = "yes";

		await service.appendEvent(session, {
			author: "agent",
			actions: { stateDelta },
		} as Event);

		expect(session.state.own).toBe("yes");
		expect(session.state.inherited).toBeUndefined();
	});

	it("appendEvent with actions but null stateDelta leaves state untouched", async () => {
		const service = new StubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		await service.appendEvent(session, {
			author: "agent",
			actions: { stateDelta: null },
		} as Event);
		expect(session.state).toEqual({ a: 1 });
		expect(session.events).toHaveLength(1);
	});

	it("deletes keys when stateDelta values are null or undefined", async () => {
		const service = new StubSessionService();
		const session = await service.createSession(
			"app",
			"user",
			{ keep: 1, dropNull: 2, dropUndef: 3 },
			"s1",
		);
		await service.appendEvent(session, {
			author: "agent",
			actions: {
				stateDelta: {
					dropNull: null,
					dropUndef: undefined,
					keep: 9,
					zero: 0,
					empty: "",
					flag: false,
				},
			},
		} as Event);
		expect(session.state).toEqual({ keep: 9, zero: 0, empty: "", flag: false });
	});

	it("appendEvent returns the same event reference", async () => {
		const service = new StubSessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		const event = { author: "agent" } as Event;
		await expect(service.appendEvent(session, event)).resolves.toBe(event);
	});

	it("actions present without stateDelta is a no-op on state", async () => {
		const service = new StubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		await service.appendEvent(session, {
			author: "agent",
			actions: {},
		} as Event);
		expect(session.state).toEqual({ a: 1 });
		expect(session.events).toHaveLength(1);
	});
});

describe("State leftover edges (post #113)", () => {
	it("get returns undefined when the stored value is explicitly undefined", () => {
		const state = State.create({ ghost: undefined }, {});
		expect(state.has("ghost")).toBe(true);
		expect(state.get("ghost")).toBeUndefined();
		expect(state.get("ghost", "fallback")).toBeUndefined();
	});

	it("has is true for keys whose value is null", () => {
		const state = State.create({ nullable: null }, {});
		expect(state.has("nullable")).toBe(true);
		expect(state.get("nullable")).toBeNull();
	});

	it("update with overlapping keys refreshes both value and delta", () => {
		const state = State.create({ a: 1 }, { b: 2 });
		state.update({ a: 10, b: 20, c: 30 });
		expect(state.toDict()).toEqual({ a: 10, b: 20, c: 30 });
		expect(state.hasDelta()).toBe(true);
	});

	it("proxy set for underscore-prefixed props writes onto the instance", () => {
		const state = State.create({}, {});
		(state as any)._privateScratch = 42;
		expect((state as any)._privateScratch).toBe(42);
		expect(state.has("_privateScratch")).toBe(false);
	});

	it("get(key, null) returns null when missing", () => {
		const state = State.create({}, {});
		expect(state.get("missing", null)).toBeNull();
	});

	it("hasDelta stays true after the first set", () => {
		const state = State.create({}, {});
		expect(state.hasDelta()).toBe(false);
		state.set("x", 1);
		expect(state.hasDelta()).toBe(true);
		state.set("y", 2);
		expect(state.hasDelta()).toBe(true);
	});
});

describe("State leftover raw get / prefix edges", () => {
	it("raw State.get returns undefined for data keys even when has is true", () => {
		const state = new State({ a: 1 }, { b: 2 });
		expect(state.has("a")).toBe(true);
		expect(state.has("b")).toBe(true);
		expect(state.get("a")).toBeUndefined();
		expect(state.get("b")).toBeUndefined();
		expect(state.get("a", "fallback")).toBeUndefined();
		expect(state.toDict()).toEqual({ a: 1, b: 2 });
	});

	it("proxied State.get returns values from value and delta maps", () => {
		const state = State.create({ a: 1 }, { b: 2 });
		expect(state.get("a")).toBe(1);
		expect(state.get("b")).toBe(2);
		expect(state.get("missing", "fallback")).toBe("fallback");
	});

	it("exposes stable APP/USER/TEMP prefix constants", () => {
		expect(State.APP_PREFIX).toBe("app:");
		expect(State.USER_PREFIX).toBe("user:");
		expect(State.TEMP_PREFIX).toBe("temp:");
	});
});
