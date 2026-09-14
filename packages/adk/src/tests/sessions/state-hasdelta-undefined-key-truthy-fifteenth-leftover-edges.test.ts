import { describe, expect, it } from "vitest";
import { State } from "../../sessions/state";

/**
 * Fifteenth leftover: hasDelta() is Object.keys(_delta).length > 0 —
 * a delta key with undefined value still counts (keys present).
 */
describe("state hasDelta undefined key truthy fifteenth leftover", () => {
	it("delta-only { a: undefined } makes hasDelta() true", () => {
		const state = State.create({}, { a: undefined });
		expect(state.hasDelta()).toBe(true);
		expect(state.has("a")).toBe(true);
	});

	it("empty delta is hasDelta() false (control)", () => {
		const state = State.create({ a: 1 }, {});
		expect(state.hasDelta()).toBe(false);
	});

	it("set() with undefined still creates a delta key", () => {
		const state = State.create({}, {});
		state.set("x", undefined);
		expect(state.hasDelta()).toBe(true);
		expect(state.has("x")).toBe(true);
	});
});
