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
 * Twelfth leftover: ctor forwards similarityTopK without `||` (0 is kept).
 * vectorDistanceThreshold default `= 10` only applies when omitted; explicit
 * `0` stays 0 (already in service.test) and explicit `""` stays "".
 */
describe("vertex-rag similarityTopK 0 vs threshold default twelfth leftover", () => {
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

	it("similarityTopK 0 is forwarded (not coalesced to undefined)", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: { contexts: [] },
		});
		const service = new VertexAiRagMemoryService("corpus", 0, 0);
		await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(rag.retrieval_query).toHaveBeenCalledWith(
			expect.objectContaining({
				similarity_top_k: 0,
				vector_distance_threshold: 0,
			}),
		);
	});

	it("omitted vectorDistanceThreshold defaults to 10", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: { contexts: [] },
		});
		const service = new VertexAiRagMemoryService("corpus", 0);
		await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(rag.retrieval_query).toHaveBeenCalledWith(
			expect.objectContaining({
				similarity_top_k: 0,
				vector_distance_threshold: 10,
			}),
		);
	});

	it("explicit empty-string threshold is kept (not default 10)", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: { contexts: [] },
		});
		const service = new VertexAiRagMemoryService("corpus", 3, "" as any);
		await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(rag.retrieval_query).toHaveBeenCalledWith(
			expect.objectContaining({
				similarity_top_k: 3,
				vector_distance_threshold: "",
			}),
		);
	});
});
