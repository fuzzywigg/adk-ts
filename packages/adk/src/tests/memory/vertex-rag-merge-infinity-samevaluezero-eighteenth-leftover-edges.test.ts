import { describe, expect, it } from "vitest";
import type { Event } from "../../events/event";
import { _mergeEventLists } from "../../memory/vertex-ai-rag-memory-service";

/**
 * Eighteenth leftover (HEAVY tip-relaunch residual after #242):
 * `_mergeEventLists` Set overlap uses SameValueZero — seventeenth pins `-0`
 * ↔ `0`; sixteenth pins NaN↔NaN. `Infinity` ↔ `Infinity` also overlap under
 * SameValueZero (distinct from NaN and from finite peers).
 */
describe("vertex-rag merge Infinity SameValueZero eighteenth leftover", () => {
	it("Infinity and Infinity timestamps overlap and merge", () => {
		expect(
			new Set([Number.POSITIVE_INFINITY]).has(Number.POSITIVE_INFINITY),
		).toBe(true);
		const left = [
			{
				author: "a",
				timestamp: Number.POSITIVE_INFINITY,
				content: { parts: [{ text: "L" }] },
			},
		] as Event[];
		const right = [
			{
				author: "b",
				timestamp: Number.POSITIVE_INFINITY,
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

	it("POSITIVE_INFINITY vs NEGATIVE_INFINITY do not overlap", () => {
		const left = [
			{
				author: "a",
				timestamp: Number.POSITIVE_INFINITY,
				content: { parts: [{ text: "L" }] },
			},
		] as Event[];
		const right = [
			{
				author: "b",
				timestamp: Number.NEGATIVE_INFINITY,
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
