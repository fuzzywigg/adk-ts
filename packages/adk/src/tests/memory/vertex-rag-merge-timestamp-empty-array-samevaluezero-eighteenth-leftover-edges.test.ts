import { describe, expect, it } from "vitest";
import type { Event } from "../../events/event";
import { _mergeEventLists } from "../../memory/vertex-ai-rag-memory-service";

/**
 * Eighteenth leftover: `_mergeEventLists` Set overlap uses SameValueZero —
 * seventeenth pins `-0`↔`0`. Empty-array timestamps stringify/identity as
 * distinct object refs: two `[]` values do NOT overlap (Set.has uses
 * SameValueZero on the array reference, not deep equality). `[]` vs `0`
 * also miss (ToNumber asymmetry is not applied by Set).
 */
describe("vertex-rag merge timestamp empty-array SameValueZero eighteenth leftover", () => {
	it("two distinct [] timestamps do not overlap", () => {
		const leftTs: any = [];
		const rightTs: any = [];
		expect(leftTs).not.toBe(rightTs);
		expect(new Set([leftTs]).has(rightTs)).toBe(false);
		const left = [
			{
				author: "a",
				timestamp: leftTs,
				content: { parts: [{ text: "L" }] },
			},
		] as Event[];
		const right = [
			{
				author: "b",
				timestamp: rightTs,
				content: { parts: [{ text: "R" }] },
			},
		] as Event[];
		const merged = _mergeEventLists([left, right]);
		expect(merged).toHaveLength(2);
	});

	it("same [] reference timestamps do overlap", () => {
		const shared: any = [];
		const left = [
			{
				author: "a",
				timestamp: shared,
				content: { parts: [{ text: "L" }] },
			},
		] as Event[];
		const right = [
			{
				author: "b",
				timestamp: shared,
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

	it("[] vs 0 timestamps do not overlap", () => {
		const left = [
			{
				author: "a",
				timestamp: [] as any,
				content: { parts: [{ text: "L" }] },
			},
		] as Event[];
		const right = [
			{
				author: "b",
				timestamp: 0,
				content: { parts: [{ text: "R" }] },
			},
		] as Event[];
		const merged = _mergeEventLists([left, right]);
		expect(merged).toHaveLength(2);
	});

	it("-0 and 0 still overlap (seventeenth control)", () => {
		const left = [
			{ author: "a", timestamp: -0, content: { parts: [{ text: "L" }] } },
		] as Event[];
		const right = [
			{ author: "b", timestamp: 0, content: { parts: [{ text: "R" }] } },
		] as Event[];
		const merged = _mergeEventLists([left, right]);
		expect(merged).toHaveLength(1);
		expect(merged[0]).toHaveLength(1);
	});
});
