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
 * Nineteenth leftover: parsed JSON `author || ""` / `text || ""` — eighteenth
 * keeps number `1`; seventeenth keeps boolean `true`. Empty array `[]` and
 * empty object `{}` are truthy and kept as the object values (not coalesced
 * to "").
 */
describe("vertex-rag json author/text empty-array-object keep nineteenth leftover", () => {
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

	it("keeps empty-array author and empty-object text from parsed JSON", async () => {
		const service = new VertexAiRagMemoryService("corpus-19");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: [],
							timestamp: 1,
							text: {},
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
		expect(result.memories[0].content?.parts?.[0]?.text).toEqual({});
	});

	it("keeps empty-object author and empty-array text", async () => {
		const service = new VertexAiRagMemoryService("corpus-19");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: {},
							timestamp: 1,
							text: [],
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
		expect(result.memories[0].author).toEqual({});
		expect(result.memories[0].content?.parts?.[0]?.text).toEqual([]);
	});

	it("number 1 author still kept (eighteenth control)", async () => {
		const service = new VertexAiRagMemoryService("corpus-19");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: 1,
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
		expect(result.memories[0].author).toBe(1);
	});

	it("numeric 0 author still coalesces to empty (falsy control)", async () => {
		const service = new VertexAiRagMemoryService("corpus-19");
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
