import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { unlinkSync, writeFileSync } = vi.hoisted(() => ({
	unlinkSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		unlinkSync,
		writeFileSync,
	};
});

import {
	_mergeEventLists,
	rag,
	VertexAiRagMemoryService,
} from "../../memory/vertex-ai-rag-memory-service";
import type { Event } from "../../events/event";

/**
 * Fourteenth leftover: `_mergeEventLists` Set overlap uses timestamp as key.
 * `timestamp: 0` is a valid distinct key (falsy elsewhere). Two lists sharing
 * 0 merge; 0 vs 1 stay separate.
 */
describe("vertex-rag merge timestamp-zero overlap fourteenth leftover", () => {
	beforeEach(() => {
		unlinkSync.mockReset();
		unlinkSync.mockImplementation(() => undefined);
		writeFileSync.mockReset();
		writeFileSync.mockImplementation(() => undefined);
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("timestamp 0 overlap merges two lists", () => {
		const left = [
			{ author: "a", timestamp: 0, content: { parts: [{ text: "L" }] } },
		] as Event[];
		const right = [
			{ author: "b", timestamp: 0, content: { parts: [{ text: "R" }] } },
			{ author: "c", timestamp: 5, content: { parts: [{ text: "C" }] } },
		] as Event[];
		const merged = _mergeEventLists([left, right]);
		expect(merged).toHaveLength(1);
		expect(merged[0]).toHaveLength(2);
		expect(merged[0].map((e) => e.author).sort()).toEqual(["a", "c"]);
	});

	it("timestamp 0 vs 1 do not overlap", () => {
		const left = [{ author: "a", timestamp: 0 }] as Event[];
		const right = [{ author: "b", timestamp: 1 }] as Event[];
		const merged = _mergeEventLists([left, right]);
		expect(merged).toHaveLength(2);
	});

	it("search path still surfaces timestamp 0 memories", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: [
							JSON.stringify({ author: "a", timestamp: 0, text: "zero" }),
							JSON.stringify({ author: "b", timestamp: 0, text: "also" }),
						].join("\n"),
					},
				],
			},
		});
		const service = new VertexAiRagMemoryService("corpus");
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(result.memories.length).toBeGreaterThanOrEqual(1);
		expect(
			result.memories.every((m) => m.timestamp === new Date(0).toISOString()),
		).toBe(true);
	});
});
