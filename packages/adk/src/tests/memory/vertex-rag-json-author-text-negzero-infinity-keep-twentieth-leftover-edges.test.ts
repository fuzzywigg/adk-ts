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
	rag,
	VertexAiRagMemoryService,
} from "../../memory/vertex-ai-rag-memory-service";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after #258):
 * `author || ""` / `text || ""` — nineteenth keeps `[]`/`{}`; eighteenth keeps
 * number `1`. String `"Infinity"` is likewise truthy and kept (numeric
 * Infinity cannot survive JSON.stringify → null). `-0` stringifies as `0`
 * which is falsy → coalesce to `""`.
 */
describe("vertex-rag json author/text negzero / Infinity keep twentieth leftover", () => {
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

	it('author/text string "Infinity" kept as-is', async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify({
							author: "Infinity",
							timestamp: 1,
							text: "Infinity",
						}),
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
		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].author).toBe("Infinity");
		expect(result.memories[0].content.parts?.[0].text).toBe("Infinity");
	});

	it('author/text -0 → JSON 0 → coalesce to ""', async () => {
		expect(JSON.stringify({ author: -0 })).toContain('"author":0');
		expect(!!-0).toBe(false);
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify({
							author: -0,
							timestamp: 1,
							text: -0,
						}),
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
		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].author).toBe("");
		expect(result.memories[0].content.parts?.[0].text).toBe("");
	});

	it("author/text [] still kept (nineteenth control)", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify({
							author: [],
							timestamp: 1,
							text: [],
						}),
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
		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].author).toEqual([]);
		expect(result.memories[0].content.parts?.[0].text).toEqual([]);
	});
});
