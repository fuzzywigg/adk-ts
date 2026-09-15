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
 * Twentieth leftover residual deepen (complements #287 JSON `"false"` /
 * bare Infinity): bare `"NaN"` / `"+Infinity"` are *not* valid JSON →
 * catch skip (same empty-memories outcome as bare `"Infinity"`, different
 * tokens). Eighteenth `"true"` / twentieth `"false"` remain controls.
 */
describe("vertex-rag context-text json-primitive NaN/+Infinity twentieth residual deepen", () => {
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

	it('bare "NaN" line is invalid JSON → skipped (empty memories)', async () => {
		expect(() => JSON.parse("NaN")).toThrow();
		const service = new VertexAiRagMemoryService("corpus-20r");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: "NaN",
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

	it('bare "+Infinity" line is invalid JSON → skipped', async () => {
		expect(() => JSON.parse("+Infinity")).toThrow();
		const service = new VertexAiRagMemoryService("corpus-20r");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: "+Infinity",
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

	it('JSON "false" still yields empty memory (twentieth control)', async () => {
		const service = new VertexAiRagMemoryService("corpus-20r");
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
	});

	it('bare "Infinity" still skipped (twentieth control)', async () => {
		const service = new VertexAiRagMemoryService("corpus-20r");
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
});
