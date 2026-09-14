import { describe, expect, it } from "vitest";
import { State } from "../../sessions/state";

/**
 * Fourteenth leftover: has() is `key in value || key in delta`.
 * Keys present with undefined still count as present; get returns undefined
 * rather than defaultValue.
 */
describe("state has undefined value vs missing fourteenth leftover", () => {
	it("key with undefined value is has() true and get skips default", () => {
		const state = State.create({ a: undefined }, {});
		expect(state.has("a")).toBe(true);
		expect(state.get("a", "fallback")).toBeUndefined();
		expect(state.has("missing")).toBe(false);
		expect(state.get("missing", "fallback")).toBe("fallback");
	});

	it("delta-only undefined key is also has() true", () => {
		const state = State.create({}, { d: undefined });
		expect(state.has("d")).toBe(true);
		expect(state.get("d", 99)).toBeUndefined();
	});

	it("null value is present and returned (control vs undefined)", () => {
		const state = State.create({ n: null }, {});
		expect(state.has("n")).toBe(true);
		expect(state.get("n", "fallback")).toBeNull();
	});
});
