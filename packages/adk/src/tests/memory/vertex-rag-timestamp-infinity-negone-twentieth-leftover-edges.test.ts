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
 * Twentieth leftover: `eventData.timestamp || "0"` then parseFloat —
 * nineteenth empty object `{}` → NaN → RangeError. JSON cannot carry
 * number Infinity (stringify → null), so string `"Infinity"` /
 * `"-Infinity"` are the residual enterers: parseFloat → ±Infinity →
 * formatTimestamp RangeError (distinct from NaN). Number `-1` survives
 * JSON and yields a valid pre-epoch ISO.
 */
describe("vertex-rag timestamp Infinity/-1 twentieth leftover", () => {
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

	it('timestamp "Infinity" → parseFloat Infinity → formatTimestamp RangeError', async () => {
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

	it('timestamp "-Infinity" → parseFloat -Infinity → RangeError', async () => {
		expect(Number.parseFloat("-Infinity")).toBe(Number.NEGATIVE_INFINITY);
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify({
							author: "a",
							timestamp: "-Infinity",
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

	it("timestamp -1 → parseFloat -1 → epoch-1ms memory", async () => {
		expect(Number.parseFloat(-1 as any)).toBe(-1);
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify({
							author: "a",
							timestamp: -1,
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
		expect(result.memories[0].timestamp).toBe(new Date(-1).toISOString());
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
