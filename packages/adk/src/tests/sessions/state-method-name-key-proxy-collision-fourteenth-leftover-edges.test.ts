import { describe, expect, it } from "vitest";
import { State } from "../../sessions/state";

/**
 * Fourteenth leftover: proxy `!(prop in target)` — keys that collide with
 * State methods (get/has/toDict) store in maps but bracket/get return methods.
 */
describe("state method-name key proxy collision fourteenth leftover", () => {
	it.each([
		"get",
		"has",
		"toDict",
		"set",
	] as const)("set(%j) is visible to has/toDict but bracket/get return the method", (key) => {
		const state = State.create({}, {});
		state.set(key, 42);

		expect(state.has(key)).toBe(true);
		expect(state.toDict()[key]).toBe(42);
		expect(typeof (state as any)[key]).toBe("function");
		expect(typeof state.get(key)).toBe("function");
	});

	it("non-colliding key works via bracket and get (control)", () => {
		const state = State.create({}, {});
		state.set("score", 7);
		expect(state["score"]).toBe(7);
		expect(state.get("score")).toBe(7);
	});
});
