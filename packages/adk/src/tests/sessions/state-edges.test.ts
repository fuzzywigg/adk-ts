import { describe, expect, it } from "vitest";
import { State } from "../../sessions/state";

describe("State leftover proxy edges", () => {
	it("proxy get returns undefined for missing keys without throwing", () => {
		const state = State.create({}, {});
		expect(state["missing"]).toBeUndefined();
		expect(state.get("missing", null)).toBeNull();
	});

	it("proxy set of underscore-prefixed keys writes onto the instance not delta", () => {
		const state = State.create({}, {});
		(state as any)._shadow = "direct";
		expect((state as any)._shadow).toBe("direct");
		expect(state.hasDelta()).toBe(false);
		expect(state.toDict()).toEqual({});
	});

	it("proxy has for underscore-prefixed keys uses in-operator on target", () => {
		const state = State.create({ visible: 1 }, {});
		expect("_value" in state).toBe(true);
		expect("_delta" in state).toBe(true);
		expect("hasDelta" in state).toBe(true);
	});

	it("symbol keys bypass the string-key state proxy branches", () => {
		const state = State.create({}, {});
		const sym = Symbol("secret");
		(state as any)[sym] = "sym-value";
		expect((state as any)[sym]).toBe("sym-value");
		expect(state.hasDelta()).toBe(false);
		expect(sym in state).toBe(true);
	});

	it("proxy get prefers own methods over colliding state keys", () => {
		const state = State.create({ has: "shadowed" }, {});
		expect(typeof state.has).toBe("function");
		expect(state.has("has")).toBe(true);
		expect(state.toDict().has).toBe("shadowed");
	});

	it("raw State without proxy does not support bracket assignment into set()", () => {
		const raw = new State({}, {});
		raw["x"] = 1;
		expect(raw.has("x")).toBe(false);
		expect(raw.hasDelta()).toBe(false);
		raw.set("x", 1);
		expect(raw.has("x")).toBe(true);
	});

	it("create returns a distinct proxy instance from the underlying State", () => {
		const value = { a: 1 };
		const delta = { b: 2 };
		const state = State.create(value, delta);
		expect(state).toBeInstanceOf(State);
		expect(state.toDict()).toEqual({ a: 1, b: 2 });
		state.set("c", 3);
		expect(value.c).toBe(3);
		expect(delta.c).toBe(3);
	});

	it("update with overlapping keys leaves both maps synchronized", () => {
		const value = { a: 1, b: 2 };
		const delta = { b: 9 };
		const state = State.create(value, delta);
		state.update({ a: 5, c: 7 });
		expect(value).toEqual({ a: 5, b: 2, c: 7 });
		expect(delta).toEqual({ b: 9, a: 5, c: 7 });
		expect(state.toDict()).toEqual({ a: 5, b: 9, c: 7 });
	});

	it("hasDelta is false for empty delta object even when value is populated", () => {
		const state = State.create({ a: 1, b: 2 }, {});
		expect(state.hasDelta()).toBe(false);
		state.set("a", 1);
		expect(state.hasDelta()).toBe(true);
	});

	it("get with explicit undefined default still returns undefined for misses", () => {
		const state = State.create({}, {});
		expect(state.get("nope", undefined)).toBeUndefined();
	});

	it("proxy in-operator is true for delta-only keys", () => {
		const state = State.create({}, { onlyDelta: true });
		expect("onlyDelta" in state).toBe(true);
		expect("missing" in state).toBe(false);
	});

	it("setting a key that collides with toDict keeps the method and stores via set()", () => {
		const state = State.create({}, {});
		expect(typeof state.toDict).toBe("function");
		state.set("toDict", "value");
		expect(typeof state.toDict).toBe("function");
		expect(state.toDict().toDict).toBe("value");
		expect(state.has("toDict")).toBe(true);
	});

	it("TEMP_PREFIX keys participate in hasDelta and toDict", () => {
		const state = State.create({}, {});
		const key = `${State.TEMP_PREFIX}draft`;
		state[key] = { draft: true };
		expect(state.hasDelta()).toBe(true);
		expect(state.toDict()[key]).toEqual({ draft: true });
		expect(key in state).toBe(true);
	});

	it("empty string keys are valid state keys through set and proxy", () => {
		const state = State.create({}, {});
		state.set("", "empty-key");
		expect(state.get("")).toBe("empty-key");
		state[" "] = "space";
		expect(state.get(" ")).toBe("space");
		expect(state.toDict()).toEqual({ "": "empty-key", " ": "space" });
	});

	it("nested object values are stored by reference", () => {
		const nested = { n: 1 };
		const state = State.create({}, {});
		state.set("obj", nested);
		nested.n = 2;
		expect(state.get("obj").n).toBe(2);
	});
});
