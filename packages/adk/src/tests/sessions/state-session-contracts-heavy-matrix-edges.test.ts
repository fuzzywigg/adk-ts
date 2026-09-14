import { describe, expect, it } from "vitest";
import type { Session } from "../../sessions/session";
import { State } from "../../sessions/state";

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "s1",
		appName: "app",
		userId: "user",
		state: {},
		events: [],
		lastUpdateTime: 0,
		...overrides,
	};
}

describe("State heavy matrix leftover edges", () => {
	it("delta wins over value for nullish and zero values", () => {
		const state = State.create(
			{ a: 1, b: "x", c: true },
			{ a: 0, b: "", c: false },
		);
		expect(state.get("a")).toBe(0);
		expect(state.get("b")).toBe("");
		expect(state.get("c")).toBe(false);
		expect(state.toDict()).toEqual({ a: 0, b: "", c: false });
	});

	it("has is true when key exists only in delta", () => {
		const state = State.create({}, { onlyDelta: 1 });
		expect(state.has("onlyDelta")).toBe(true);
		expect(state.get("onlyDelta")).toBe(1);
	});

	it("has is true when key exists only in value", () => {
		const state = State.create({ onlyValue: 2 }, {});
		expect(state.has("onlyValue")).toBe(true);
		expect(state.get("onlyValue")).toBe(2);
	});

	it("set overwrites both maps and keeps hasDelta true", () => {
		const value: Record<string, any> = { k: "old" };
		const delta: Record<string, any> = {};
		const state = State.create(value, delta);
		state.set("k", "new");
		expect(value.k).toBe("new");
		expect(delta.k).toBe("new");
		expect(state.hasDelta()).toBe(true);
	});

	it("update with overlapping and new keys merges into both maps", () => {
		const value: Record<string, any> = { a: 1 };
		const delta: Record<string, any> = { b: 2 };
		const state = State.create(value, delta);
		state.update({ a: 9, c: 3 });
		expect(value).toEqual({ a: 9, c: 3 });
		expect(delta).toEqual({ b: 2, a: 9, c: 3 });
		expect(state.toDict()).toEqual({ a: 9, b: 2, c: 3 });
	});

	it("toDict delta overwrite order is value then delta", () => {
		const state = State.create({ shared: "v", onlyV: 1 }, { shared: "d" });
		expect(Object.keys(state.toDict()).sort()).toEqual(["onlyV", "shared"]);
		expect(state.toDict().shared).toBe("d");
	});

	it("proxy get falls through to undefined for missing keys", () => {
		const state = State.create({}, {});
		expect(state["missing"]).toBeUndefined();
		expect("missing" in state).toBe(false);
	});

	it("proxy assignment for normal keys routes through set", () => {
		const value: Record<string, any> = {};
		const delta: Record<string, any> = {};
		const state = State.create(value, delta);
		state["routed"] = 7;
		expect(value.routed).toBe(7);
		expect(delta.routed).toBe(7);
	});

	it("underscore-prefixed keys are instance properties not delta", () => {
		const state = State.create({}, {});
		(state as any)._internal = { n: 1 };
		expect((state as any)._internal).toEqual({ n: 1 });
		expect(state.hasDelta()).toBe(false);
		expect(state.toDict()).toEqual({});
	});

	it("APP/USER/TEMP prefix constants are stable strings", () => {
		expect(State.APP_PREFIX).toBe("app:");
		expect(State.USER_PREFIX).toBe("user:");
		expect(State.TEMP_PREFIX).toBe("temp:");
	});

	it("prefix keys round-trip through set/get/has/toDict", () => {
		const state = State.create({}, {});
		const keys = [
			`${State.APP_PREFIX}x`,
			`${State.USER_PREFIX}y`,
			`${State.TEMP_PREFIX}z`,
		];
		for (const key of keys) {
			state.set(key, key);
			expect(state.has(key)).toBe(true);
			expect(state.get(key)).toBe(key);
		}
		expect(Object.keys(state.toDict()).sort()).toEqual([...keys].sort());
	});

	it("raw State without proxy requires set for mutations", () => {
		const raw = new State({}, {});
		raw["direct"] = 1;
		expect(raw.has("direct")).toBe(false);
		raw.set("direct", 1);
		expect(raw.has("direct")).toBe(true);
		expect(raw.hasDelta()).toBe(true);
	});

	it("hasDelta ignores empty-string keys only when delta is empty", () => {
		const state = State.create({ "": "empty" }, {});
		expect(state.hasDelta()).toBe(false);
		state.set("", "again");
		expect(state.hasDelta()).toBe(true);
		expect(state.get("")).toBe("again");
	});

	it("get default is ignored when key exists with undefined value in delta", () => {
		const state = State.create({}, { u: undefined });
		expect(state.has("u")).toBe(true);
		expect(state.get("u", "fallback")).toBeUndefined();
	});

	it("nested arrays and objects remain referentially shared", () => {
		const arr = [1, 2];
		const obj = { a: arr };
		const state = State.create({}, {});
		state.set("obj", obj);
		arr.push(3);
		expect(state.get("obj").a).toEqual([1, 2, 3]);
	});

	it("update({}) does not clear existing delta entries", () => {
		const state = State.create({}, { pending: true });
		state.update({});
		expect(state.hasDelta()).toBe(true);
		expect(state.get("pending")).toBe(true);
	});

	it("create returns a proxied State instance", () => {
		const state = State.create({ a: 1 }, {});
		expect(state).toBeInstanceOf(State);
		expect(state.get("a")).toBe(1);
	});

	it("method names remain callable when shadowed in value map", () => {
		const state = State.create(
			{ get: "shadow", set: "shadow", has: "shadow", update: "shadow" },
			{},
		);
		expect(typeof state.get).toBe("function");
		expect(typeof state.set).toBe("function");
		expect(typeof state.has).toBe("function");
		expect(typeof state.update).toBe("function");
		expect(state.has("get")).toBe(true);
		expect(state.toDict().get).toBe("shadow");
	});

	it("symbol keys do not participate in string-key state routing", () => {
		const state = State.create({}, {});
		const sym = Symbol("hidden");
		(state as any)[sym] = "secret";
		expect((state as any)[sym]).toBe("secret");
		expect(state.hasDelta()).toBe(false);
		expect(sym in state).toBe(true);
	});
});

describe("Session model contract heavy matrix leftover edges", () => {
	it("allows undefined-looking empty collections independently", () => {
		const session = makeSession();
		expect(session.state).toEqual({});
		expect(session.events).toEqual([]);
		session.state.k = 1;
		session.events.push({ author: "u" } as Session["events"][number]);
		expect(makeSession().state).toEqual({});
		expect(makeSession().events).toEqual([]);
	});

	it("preserves event author and timestamp fields as assigned", () => {
		const session = makeSession();
		session.events.push({
			author: "agent",
			timestamp: 1.5,
		} as Session["events"][number]);
		expect(session.events[0].author).toBe("agent");
		expect(session.events[0].timestamp).toBe(1.5);
	});

	it("supports unicode ids and app/user names", () => {
		const session = makeSession({
			id: "会话-1",
			appName: "アプリ",
			userId: "ユーザー",
		});
		expect(session.id).toBe("会话-1");
		expect(session.appName).toBe("アプリ");
		expect(session.userId).toBe("ユーザー");
	});

	it("lastUpdateTime can be negative or fractional", () => {
		const session = makeSession({ lastUpdateTime: -0.5 });
		expect(session.lastUpdateTime).toBe(-0.5);
		session.lastUpdateTime = 0.0001;
		expect(session.lastUpdateTime).toBe(0.0001);
	});

	it("state bag accepts mixed primitive types", () => {
		const session = makeSession({
			state: {
				n: 0,
				s: "",
				b: false,
				nil: null,
				list: [],
			},
		});
		expect(session.state.n).toBe(0);
		expect(session.state.s).toBe("");
		expect(session.state.b).toBe(false);
		expect(session.state.nil).toBeNull();
		expect(session.state.list).toEqual([]);
	});

	it("events array retains insertion order under splice", () => {
		const session = makeSession();
		session.events.push(
			{ author: "a" } as Session["events"][number],
			{ author: "b" } as Session["events"][number],
			{ author: "c" } as Session["events"][number],
		);
		session.events.splice(1, 1);
		expect(session.events.map((e) => e.author)).toEqual(["a", "c"]);
	});
});
