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
});
