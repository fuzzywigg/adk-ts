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
 * Nineteenth leftover: context.text line is a JSON *primitive/container* —
 * eighteenth pins `"true"` / `"1"` (boxed property access → empty fields).
 * Primitive `"[]"` / `"{}"` likewise parse to containers whose `.author` /
 * `.timestamp` / `.text` are undefined → empty author/text epoch memory
 * (NOT the null skip path).
 */
describe("vertex-rag context-text json-primitive empty-array-object nineteenth leftover", () => {
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

	it('JSON "[]" line yields empty author/text epoch memory', async () => {
		expect(([] as any).author).toBeUndefined();
		const service = new VertexAiRagMemoryService("corpus-19");
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
		expect(result.memories[0].content?.parts?.[0]?.text).toBe("");
		expect(result.memories[0].timestamp).toBe(new Date(0).toISOString());
	});

	it('JSON "{}" line yields empty author/text epoch memory', async () => {
		expect(({} as any).author).toBeUndefined();
		const service = new VertexAiRagMemoryService("corpus-19");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: "{}",
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

	it('JSON "-1" line yields empty author/text epoch memory', async () => {
		expect((-1 as any).author).toBeUndefined();
		const service = new VertexAiRagMemoryService("corpus-19");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: "-1",
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

	it('JSON "true" still yields empty memory (eighteenth control)', async () => {
		const service = new VertexAiRagMemoryService("corpus-19");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: "true",
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
		const service = new VertexAiRagMemoryService("corpus-19");
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
