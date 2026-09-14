import { describe, expect, it } from "vitest";
import type { Event } from "../../events/event";
import { _mergeEventLists } from "../../memory/vertex-ai-rag-memory-service";

/**
 * Seventeenth leftover: `_mergeEventLists` Set overlap uses SameValueZero —
 * sixteenth pins NaN↔NaN overlap and NaN↔0 miss; fifteenth pins `"0"` vs `0`
 * no-overlap. `-0` and `0` DO overlap under SameValueZero (Set.has), even
 * though Object.is(-0, 0) is false.
 */
describe("vertex-rag merge -0 vs 0 SameValueZero seventeenth leftover", () => {
	it("-0 and 0 timestamps overlap and merge", () => {
		expect(Object.is(-0, 0)).toBe(false);
		expect(new Set([-0]).has(0)).toBe(true);
		const left = [
			{
				author: "a",
				timestamp: -0,
				content: { parts: [{ text: "L" }] },
			},
		] as Event[];
		const right = [
			{
				author: "b",
				timestamp: 0,
				content: { parts: [{ text: "R" }] },
			},
			{
				author: "c",
				timestamp: 5,
				content: { parts: [{ text: "C" }] },
			},
		] as Event[];
		const merged = _mergeEventLists([left, right]);
		expect(merged).toHaveLength(1);
		expect(merged[0]).toHaveLength(2);
		expect(merged[0].map((e) => e.author).sort()).toEqual(["a", "c"]);
	});

	it("0 and -0 still overlap when swapped", () => {
		const left = [
			{ author: "a", timestamp: 0, content: { parts: [{ text: "L" }] } },
		] as Event[];
		const right = [
			{
				author: "b",
				timestamp: -0,
				content: { parts: [{ text: "R" }] },
			},
		] as Event[];
		const merged = _mergeEventLists([left, right]);
		expect(merged).toHaveLength(1);
		expect(merged[0]).toHaveLength(1);
		expect(merged[0][0].author).toBe("a");
	});

	it('timestamp 0 vs "0" still do not overlap (fifteenth control)', () => {
		const left = [
			{ author: "a", timestamp: 0, content: { parts: [{ text: "L" }] } },
		] as Event[];
		const right = [
			{
				author: "b",
				timestamp: "0" as any,
				content: { parts: [{ text: "R" }] },
			},
		] as Event[];
		const merged = _mergeEventLists([left, right]);
		expect(merged).toHaveLength(2);
	});
});
