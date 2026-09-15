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
 * Twentieth leftover: parsed JSON `author || ""` / `text || ""` — nineteenth
 * keeps `[]` / `{}`; eighteenth keeps number `1`. String `"Infinity"` and
 * number `-1` are truthy and kept (JSON cannot round-trip number Infinity —
 * stringify collapses it to null → falsy coalesce).
 */
describe("vertex-rag json author/text Infinity-string/-1 keep twentieth leftover", () => {
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

	it('keeps string "Infinity" author and number -1 text', async () => {
		const service = new VertexAiRagMemoryService("corpus-20");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: "Infinity",
							timestamp: 1,
							text: -1,
						}),
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].author).toBe("Infinity");
		expect(result.memories[0].content?.parts?.[0]?.text).toBe(-1);
	});

	it('keeps number -1 author and string "-Infinity" text', async () => {
		const service = new VertexAiRagMemoryService("corpus-20");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: -1,
							timestamp: 1,
							text: "-Infinity",
						}),
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].author).toBe(-1);
		expect(result.memories[0].content?.parts?.[0]?.text).toBe("-Infinity");
	});

	it("empty-array author still kept (nineteenth control)", async () => {
		const service = new VertexAiRagMemoryService("corpus-20");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: [],
							timestamp: 1,
							text: "kept",
						}),
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].author).toEqual([]);
	});

	it("numeric 0 author still coalesces to empty (falsy control)", async () => {
		const service = new VertexAiRagMemoryService("corpus-20");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: 0,
							timestamp: 1,
							text: "t",
						}),
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].author).toBe("");
	});
});
