import { describe, expect, it } from "vitest";
import { State } from "../../sessions/state";

/**
 * Leftover: State.set("_key") writes into _value/_delta maps, but proxy get/set
 * treats underscore props as instance fields — so bracket/get miss the value
 * even though has() (map membership) returns true.
 */
describe("state underscore key proxy bypass ninth leftover edges", () => {
	it("set('_hidden') is visible to has/toDict but not bracket/get", () => {
		const state = State.create({}, {});
		state.set("_hidden", 1);

		expect(state.has("_hidden")).toBe(true);
		expect(state.toDict()).toEqual({ _hidden: 1 });
		expect(state["_hidden"]).toBeUndefined();
		expect(state.get("_hidden")).toBeUndefined();
		expect(state.get("_hidden", "fallback")).toBeUndefined();
	});

	it("set('visible') works via bracket and get (control)", () => {
		const state = State.create({}, {});
		state.set("visible", 1);
		expect(state.has("visible")).toBe(true);
		expect(state["visible"]).toBe(1);
		expect(state.get("visible")).toBe(1);
		expect(state.toDict()).toEqual({ visible: 1 });
	});

	it("proxy assignment of _marker does not enter state maps (control)", () => {
		const state = State.create({}, {});
		(state as any)._marker = true;
		expect((state as any)._marker).toBe(true);
		expect(state.has("_marker")).toBe(false);
		expect(state.toDict()).toEqual({});
	});
});
