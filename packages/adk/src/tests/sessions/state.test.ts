import { describe, expect, it } from "vitest";
import { State } from "../../sessions/state";

describe("State", () => {
	it("exposes prefix constants", () => {
		expect(State.APP_PREFIX).toBe("app:");
		expect(State.USER_PREFIX).toBe("user:");
		expect(State.TEMP_PREFIX).toBe("temp:");
	});

	it("gets values from value map and supports defaults", () => {
		const state = State.create({ foo: "bar" }, {});
		expect(state.get("foo")).toBe("bar");
		expect(state.get("missing", "fallback")).toBe("fallback");
		expect(state.has("foo")).toBe(true);
		expect(state.has("missing")).toBe(false);
	});

	it("prefers delta over committed value for reads", () => {
		const state = State.create({ key: "committed" }, { key: "pending" });
		expect(state.get("key")).toBe("pending");
		expect(state["key"]).toBe("pending");
	});

	it("set updates value and delta", () => {
		const state = State.create({}, {});
		expect(state.hasDelta()).toBe(false);

		state.set("count", 1);
		expect(state.get("count")).toBe(1);
		expect(state.hasDelta()).toBe(true);
		expect(state.toDict()).toEqual({ count: 1 });
	});

	it("update merges into value and delta", () => {
		const state = State.create({ a: 1 }, {});
		state.update({ b: 2, a: 3 });
		expect(state.toDict()).toEqual({ a: 3, b: 2 });
		expect(state.hasDelta()).toBe(true);
	});

	it("supports proxy assignment", () => {
		const state = State.create({}, {});
		state["user:name"] = "alice";
		expect(state.get("user:name")).toBe("alice");
		expect("user:name" in state).toBe(true);
	});

	it("supports TEMP_PREFIX keys", () => {
		const key = `${State.TEMP_PREFIX}scratch`;
		const state = State.create({}, {});
		state.set(key, "transient");
		expect(state.get(key)).toBe("transient");
		expect(state.has(key)).toBe(true);
		expect(state.toDict()[key]).toBe("transient");
	});

	it("returns empty object from toDict when empty", () => {
		const state = State.create({}, {});
		expect(state.toDict()).toEqual({});
		expect(state.hasDelta()).toBe(false);
	});

	it("hasDelta becomes true after update", () => {
		const state = State.create({ keep: 1 }, {});
		expect(state.hasDelta()).toBe(false);
		state.update({ keep: 2, added: 3 });
		expect(state.hasDelta()).toBe(true);
		expect(state.toDict()).toEqual({ keep: 2, added: 3 });
	});

	it("has is true for delta-only keys that are not yet in value", () => {
		const state = State.create({}, { pending: "yes" });
		expect(state.has("pending")).toBe(true);
		expect(state.get("pending")).toBe("yes");
		expect(state.toDict()).toEqual({ pending: "yes" });
	});

	it("returns undefined from get when key is missing and no default given", () => {
		const state = State.create({}, {});
		expect(state.get("missing")).toBeUndefined();
	});

	it("proxy in-operator and underscore props stay on the instance", () => {
		const state = State.create({ visible: 1 }, {});
		expect("visible" in state).toBe(true);
		expect("absent" in state).toBe(false);
		expect("hasDelta" in state).toBe(true);
		expect(typeof state.hasDelta).toBe("function");
	});

	it("supports APP_PREFIX and USER_PREFIX keys via set and proxy", () => {
		const state = State.create({}, {});
		const appKey = `${State.APP_PREFIX}theme`;
		const userKey = `${State.USER_PREFIX}locale`;
		state.set(appKey, "dark");
		state[userKey] = "en";
		expect(state.get(appKey)).toBe("dark");
		expect(state.get(userKey)).toBe("en");
		expect(state.toDict()).toEqual({ [appKey]: "dark", [userKey]: "en" });
	});

	it("raw constructor supports has/hasDelta/toDict without proxy reads", () => {
		const raw = new State({ a: 1 }, { b: 2 });
		expect(raw.has("a")).toBe(true);
		expect(raw.has("b")).toBe(true);
		expect(raw.hasDelta()).toBe(true);
		expect(raw.toDict()).toEqual({ a: 1, b: 2 });
		raw.set("c", 3);
		expect(raw.toDict()).toEqual({ a: 1, b: 2, c: 3 });
		raw.update({ a: 9 });
		expect(raw.toDict().a).toBe(9);
	});

	it("proxied create prefers delta for bracket access", () => {
		const state = State.create({ a: "value" }, { a: "delta" });
		expect(state["a"]).toBe("delta");
		expect(state.get("a")).toBe("delta");
	});

	it("set overwrites both value and delta for the same key", () => {
		const state = State.create({ count: 0 }, { count: 1 });
		state.set("count", 5);
		expect(state.get("count")).toBe(5);
		expect(state.toDict()).toEqual({ count: 5 });
		expect(state.hasDelta()).toBe(true);
	});

	it("update with empty object does not clear existing delta", () => {
		const state = State.create({}, { pending: true });
		state.update({});
		expect(state.hasDelta()).toBe(true);
		expect(state.get("pending")).toBe(true);
	});

	it("get default is ignored when key exists in delta only", () => {
		const state = State.create({}, { secret: "x" });
		expect(state.get("secret", "fallback")).toBe("x");
	});

	it("proxy set still works for keys that collide with method names only via underscore rule", () => {
		const state = State.create({}, {});
		state["custom"] = { nested: true };
		expect(state.get("custom")).toEqual({ nested: true });
		expect(state.has("custom")).toBe(true);
	});

	it("toDict merges value then delta so delta wins on conflict", () => {
		const state = State.create({ a: 1, b: 2 }, { b: 9, c: 3 });
		expect(state.toDict()).toEqual({ a: 1, b: 9, c: 3 });
	});

	it("set writes through both value and delta stores", () => {
		const state = State.create({ a: 1 }, {});
		state.set("a", 2);
		state.set("b", 3);
		expect(state.get("a")).toBe(2);
		expect(state.get("b")).toBe(3);
		expect(state.hasDelta()).toBe(true);
		expect(state.toDict()).toEqual({ a: 2, b: 3 });
	});

	it("get returns undefined default when key is absent", () => {
		const state = State.create({}, {});
		expect(state.get("missing")).toBeUndefined();
		expect(state.get("missing", null)).toBeNull();
		expect(state.has("missing")).toBe(false);
	});

	it("has is true for value-only or delta-only keys", () => {
		const state = State.create({ onlyValue: 1 }, { onlyDelta: 2 });
		expect(state.has("onlyValue")).toBe(true);
		expect(state.has("onlyDelta")).toBe(true);
		expect(state.get("onlyValue")).toBe(1);
		expect(state.get("onlyDelta")).toBe(2);
	});

	it("update merges into both stores and preserves prior delta keys", () => {
		const state = State.create({ a: 1 }, { pending: true });
		state.update({ a: 5, b: 6 });
		expect(state.toDict()).toEqual({ a: 5, pending: true, b: 6 });
		expect(state.hasDelta()).toBe(true);
	});

	it("proxy set routes underscore-prefixed props as instance fields not state keys", () => {
		const state = State.create({ keep: 1 }, {});
		(state as any)._custom = "meta";
		expect((state as any)._custom).toBe("meta");
		expect(state.has("_custom")).toBe(false);
		expect(state.toDict()).toEqual({ keep: 1 });
		state["ok"] = 2;
		expect(state.get("ok")).toBe(2);
	});

	it("prefix constants match documented app/user/temp markers", () => {
		expect(State.APP_PREFIX).toBe("app:");
		expect(State.USER_PREFIX).toBe("user:");
		expect(State.TEMP_PREFIX).toBe("temp:");
	});

	it("hasDelta is false for empty delta after create", () => {
		const state = State.create({ a: 1 }, {});
		expect(state.hasDelta()).toBe(false);
		state.update({});
		expect(state.hasDelta()).toBe(false);
	});

	it("delta overrides value for the same key via proxy get", () => {
		const state = State.create({ k: "value" }, { k: "delta" });
		expect(state["k"]).toBe("delta");
		expect(state.get("k")).toBe("delta");
	});
});
