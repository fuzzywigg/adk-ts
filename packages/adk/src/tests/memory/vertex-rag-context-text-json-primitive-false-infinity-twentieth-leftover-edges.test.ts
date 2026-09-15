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
 * Twentieth leftover: context.text line is a JSON *primitive* — nineteenth
 * pins `"[]"` / `"{}"` / `"-1"`; eighteenth pins `"true"` / `"1"`. Primitive
 * `"false"` parses to boolean false → property access yields undefined →
 * empty author/text epoch memory. Bare `"Infinity"` / `"-Infinity"` are
 * *not* valid JSON → catch skip (same empty-memories outcome as `"null"`
 * TypeError skip, different parse failure).
 */
describe("vertex-rag context-text json-primitive false/Infinity twentieth leftover", () => {
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

	it('JSON "false" line yields empty author/text epoch memory', async () => {
		expect((false as any).author).toBeUndefined();
		const service = new VertexAiRagMemoryService("corpus-20");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: "false",
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
		expect(result.memories[0].timestamp).toBe(new Date(0).toISOString());
	});

	it('bare "Infinity" line is invalid JSON → skipped (empty memories)', async () => {
		expect(() => JSON.parse("Infinity")).toThrow();
		const service = new VertexAiRagMemoryService("corpus-20");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: "Infinity",
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(result.memories).toEqual([]);
	});

	it('bare "-Infinity" line is invalid JSON → skipped', async () => {
		const service = new VertexAiRagMemoryService("corpus-20");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: "-Infinity",
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(result.memories).toEqual([]);
	});

	it('JSON "[]" still yields empty memory (nineteenth control)', async () => {
		const service = new VertexAiRagMemoryService("corpus-20");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: "[]",
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

	it('JSON "null" still skipped (sixteenth control)', async () => {
		const service = new VertexAiRagMemoryService("corpus-20");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: "null",
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(result.memories).toEqual([]);
	});
});
