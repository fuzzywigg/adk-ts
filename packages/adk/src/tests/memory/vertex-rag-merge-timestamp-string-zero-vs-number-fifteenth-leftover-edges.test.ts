import { describe, expect, it } from "vitest";
import { _mergeEventLists } from "../../memory/vertex-ai-rag-memory-service";
import type { Event } from "../../events/event";

/**
 * Fifteenth leftover: `_mergeEventLists` Set overlap uses SameValueZero —
 * fourteenth pins numeric `0` overlap. String `"0"` vs number `0` do NOT
 * overlap (distinct Set keys); both `"0"` do merge.
 */
describe("vertex-rag merge timestamp string-zero vs number fifteenth leftover", () => {
	it('timestamp 0 vs "0" do not overlap', () => {
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
		expect(merged[0]).toHaveLength(1);
		expect(merged[1]).toHaveLength(1);
	});

	it('both timestamp "0" overlap and merge', () => {
		const left = [
			{
				author: "a",
				timestamp: "0" as any,
				content: { parts: [{ text: "L" }] },
			},
		] as Event[];
		const right = [
			{
				author: "b",
				timestamp: "0" as any,
				content: { parts: [{ text: "R" }] },
			},
			{
				author: "c",
				timestamp: "5" as any,
				content: { parts: [{ text: "C" }] },
			},
		] as Event[];
		const merged = _mergeEventLists([left, right]);
		expect(merged).toHaveLength(1);
		expect(merged[0]).toHaveLength(2);
		expect(merged[0].map((e) => e.author).sort()).toEqual(["a", "c"]);
	});

	it("numeric 0 overlap still merges (fourteenth control)", () => {
		const left = [{ author: "a", timestamp: 0 }] as Event[];
		const right = [
			{ author: "b", timestamp: 0 },
			{ author: "c", timestamp: 1 },
		] as Event[];
		const merged = _mergeEventLists([left, right]);
		expect(merged).toHaveLength(1);
		expect(merged[0]).toHaveLength(2);
	});
});
