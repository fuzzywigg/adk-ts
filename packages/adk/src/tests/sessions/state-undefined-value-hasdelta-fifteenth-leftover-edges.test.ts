import { describe, expect, it } from "vitest";
import { State } from "../../sessions/state";

/**
 * Fifteenth leftover: set(key, undefined) still writes the key into _delta —
 * hasDelta() is true and toDict keeps the undefined value. Fourteenth covered
 * has()/get() only.
 */
describe("state undefined value hasDelta fifteenth leftover", () => {
	it("set(k, undefined) marks hasDelta and keeps key in toDict", () => {
		const state = State.create({}, {});
		expect(state.hasDelta()).toBe(false);
		state.set("k", undefined);
		expect(state.has("k")).toBe(true);
		expect(state.hasDelta()).toBe(true);
		expect(Object.keys(state.toDict())).toEqual(["k"]);
		expect(state.toDict().k).toBeUndefined();
	});

	it("update with undefined value likewise marks hasDelta", () => {
		const state = State.create({ a: 1 }, {});
		state.update({ b: undefined });
		expect(state.hasDelta()).toBe(true);
		expect(state.has("b")).toBe(true);
		expect(state.toDict()).toEqual({ a: 1, b: undefined });
	});
});
