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
 * Twenty-first leftover residual deepen (complements #287 string Infinity/-1):
 * JSON round-trips `Object(1)` → number `1` kept by `author || ""` /
 * `text || ""`; `Object(false)` → boolean `false` coalesces to `""`
 * (asymmetry vs pre-JSON boxed truthiness).
 */
describe("vertex-rag json author/text object-one/object-false twenty-first residual deepen", () => {
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

	it("keeps Object(1) author and Object(1) text after JSON round-trip", async () => {
		expect(JSON.stringify({ author: Object(1), text: Object(1) })).toBe(
			'{"author":1,"text":1}',
		);
		const service = new VertexAiRagMemoryService("corpus-21");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: Object(1),
							timestamp: 1,
							text: Object(1),
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
		expect(result.memories[0].content?.parts?.[0]?.text).toBe(1);
	});

	it('Object(false) author/text coalesce to "" after JSON → boolean false', async () => {
		expect(JSON.stringify({ author: Object(false) })).toBe('{"author":false}');
		expect(Boolean(Object(false))).toBe(true);
		const service = new VertexAiRagMemoryService("corpus-21");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: Object(false),
							timestamp: 1,
							text: Object(false),
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
		expect(result.memories[0].content?.parts?.[0]?.text).toBe("");
	});

	it('keeps string "Infinity" author (twentieth control)', async () => {
		const service = new VertexAiRagMemoryService("corpus-21");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: "Infinity",
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
		expect(result.memories[0].author).toBe("Infinity");
	});
});
