import { describe, expect, it } from "vitest";
import type { Event } from "../../events/event";
import { _mergeEventLists } from "../../memory/vertex-ai-rag-memory-service";

/**
 * Sixteenth leftover: `_mergeEventLists` Set overlap uses SameValueZero —
 * fourteenth pins numeric `0` overlap; fifteenth `"0"` vs `0` no-overlap.
 * Two `NaN` timestamps DO overlap (SameValueZero treats NaN equal).
 */
describe("vertex-rag merge timestamp NaN SameValueZero sixteenth leftover", () => {
	it("two NaN timestamps overlap and merge", () => {
		const left = [
			{
				author: "a",
				timestamp: Number.NaN,
				content: { parts: [{ text: "L" }] },
			},
		] as Event[];
		const right = [
			{
				author: "b",
				timestamp: Number.NaN,
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

	it("NaN vs 0 do not overlap", () => {
		const left = [
			{
				author: "a",
				timestamp: Number.NaN,
				content: { parts: [{ text: "L" }] },
			},
		] as Event[];
		const right = [
			{ author: "b", timestamp: 0, content: { parts: [{ text: "R" }] } },
		] as Event[];
		const merged = _mergeEventLists([left, right]);
		expect(merged).toHaveLength(2);
		expect(merged[0]).toHaveLength(1);
		expect(merged[1]).toHaveLength(1);
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
