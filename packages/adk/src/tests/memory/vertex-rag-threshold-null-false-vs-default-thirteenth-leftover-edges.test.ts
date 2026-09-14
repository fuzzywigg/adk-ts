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
 * Thirteenth leftover: ctor default `vectorDistanceThreshold = 10` applies only
 * for `undefined` (omitted). Explicit `null` / `false` are kept (JS default
 * params). Twelfth pinned 0 and "". similarityTopK has no default — null/false/
 * whitespace forward as-is.
 */
describe("vertex-rag threshold null/false vs default thirteenth leftover", () => {
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

	it("explicit null threshold is kept (not default 10)", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: { contexts: [] },
		});
		const service = new VertexAiRagMemoryService("corpus", 2, null as any);
		await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(rag.retrieval_query).toHaveBeenCalledWith(
			expect.objectContaining({
				similarity_top_k: 2,
				vector_distance_threshold: null,
			}),
		);
	});

	it("explicit false threshold is kept", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: { contexts: [] },
		});
		const service = new VertexAiRagMemoryService("corpus", 2, false as any);
		await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(rag.retrieval_query).toHaveBeenCalledWith(
			expect.objectContaining({
				vector_distance_threshold: false,
			}),
		);
	});

	it.each([
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "space", value: " " },
		{ label: "empty string", value: "" },
	])("similarityTopK $label is forwarded without coalesce", async ({
		value,
	}) => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: { contexts: [] },
		});
		const service = new VertexAiRagMemoryService("corpus", value as any, 5);
		await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(rag.retrieval_query).toHaveBeenCalledWith(
			expect.objectContaining({
				similarity_top_k: value,
				vector_distance_threshold: 5,
			}),
		);
	});

	it("omitted threshold still defaults to 10 (twelfth control)", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: { contexts: [] },
		});
		const service = new VertexAiRagMemoryService("corpus", 1);
		await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(rag.retrieval_query).toHaveBeenCalledWith(
			expect.objectContaining({
				vector_distance_threshold: 10,
			}),
		);
	});
});
