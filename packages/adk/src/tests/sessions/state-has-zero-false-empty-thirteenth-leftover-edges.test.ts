import { describe, expect, it } from "vitest";
import { State } from "../../sessions/state";

/**
 * Thirteenth leftover: has() is `key in _value || key in _delta` — stored 0 /
 * false / "" still count as present (unlike truthiness).
 */
describe("state has() zero/false/empty thirteenth leftover", () => {
	it("has() is true for 0/false/empty-string values", () => {
		const state = State.create({ n: 0, f: false, s: "" }, {});
		expect(state.has("n")).toBe(true);
		expect(state.has("f")).toBe(true);
		expect(state.has("s")).toBe(true);
		expect(state.get("n")).toBe(0);
		expect(state.get("f")).toBe(false);
		expect(state.get("s")).toBe("");
	});

	it("delta 0 wins over missing value", () => {
		const state = State.create({}, { n: 0 });
		expect(state.has("n")).toBe(true);
		expect(state.get("n")).toBe(0);
	});

	it("missing key returns defaultValue (control)", () => {
		const state = State.create({}, {});
		expect(state.has("missing")).toBe(false);
		expect(state.get("missing", 7)).toBe(7);
	});
});
