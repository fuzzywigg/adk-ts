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
 * `eventData.timestamp || "0"` then parseFloat — nineteenth pins `{}` → NaN
 * throw. JSON numeric `Infinity` stringifies to `null` → coalesce `"0"` →
 * epoch (asymmetry vs string `"Infinity"` → parseFloat Infinity → RangeError).
 */
describe("vertex-rag timestamp Infinity JSON-null vs string twentieth leftover", () => {
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

	it('JSON Infinity → null → coalesce "0" → epoch memory', async () => {
		expect(JSON.stringify({ timestamp: Number.POSITIVE_INFINITY })).toContain(
			'"timestamp":null',
		);
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify({
							author: "a",
							timestamp: Number.POSITIVE_INFINITY,
							text: "t",
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
		expect(result.memories[0].timestamp).toBe(new Date(0).toISOString());
	});

	it('timestamp string "Infinity" → parseFloat Infinity → RangeError', async () => {
		expect(Number.parseFloat("Infinity")).toBe(Number.POSITIVE_INFINITY);
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify({
							author: "a",
							timestamp: "Infinity",
							text: "t",
						}),
					},
				],
			},
		});
		const service = new VertexAiRagMemoryService("corpus");
		await expect(
			service.searchMemory({
				appName: "app",
				userId: "user",
				query: "q",
			}),
		).rejects.toThrow(RangeError);
	});

	it('JSON -Infinity → null → coalesce "0" → epoch memory', async () => {
		expect(JSON.stringify({ timestamp: Number.NEGATIVE_INFINITY })).toContain(
			'"timestamp":null',
		);
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify({
							author: "a",
							timestamp: Number.NEGATIVE_INFINITY,
							text: "t",
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
		expect(result.memories[0].timestamp).toBe(new Date(0).toISOString());
	});

	it("timestamp {} still NaN → RangeError (nineteenth control)", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify({
							author: "a",
							timestamp: {},
							text: "t",
						}),
					},
				],
			},
		});
		const service = new VertexAiRagMemoryService("corpus");
		await expect(
			service.searchMemory({
				appName: "app",
				userId: "user",
				query: "q",
			}),
		).rejects.toThrow(RangeError);
	});
});
