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
 * Twentieth leftover residual deepen (complements #287 "Infinity"/-1
 * author/text keep): string `"true"` / `"NaN"` are truthy and kept
 * (distinct from number `-1` / string `"Infinity"` peers; not coalesced).
 */
describe("vertex-rag json author/text string-true/NaN keep twentieth residual deepen", () => {
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

	it('keeps string "true" author and string "NaN" text', async () => {
		const service = new VertexAiRagMemoryService("corpus-20r");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: "true",
							timestamp: 1,
							text: "NaN",
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
		expect(result.memories[0].author).toBe("true");
		expect(result.memories[0].content?.parts?.[0]?.text).toBe("NaN");
	});

	it('keeps string "NaN" author and string "true" text', async () => {
		const service = new VertexAiRagMemoryService("corpus-20r");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: "NaN",
							timestamp: 1,
							text: "true",
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
		expect(result.memories[0].author).toBe("NaN");
		expect(result.memories[0].content?.parts?.[0]?.text).toBe("true");
	});

	it('string "Infinity" author still kept (twentieth control)', async () => {
		const service = new VertexAiRagMemoryService("corpus-20r");
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
		expect(result.memories[0].author).toBe("Infinity");
		expect(result.memories[0].content?.parts?.[0]?.text).toBe(-1);
	});

	it("numeric 0 author still coalesces to empty (falsy control)", async () => {
		const service = new VertexAiRagMemoryService("corpus-20r");
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
		expect(result.memories[0].author).toBe("");
	});
});
