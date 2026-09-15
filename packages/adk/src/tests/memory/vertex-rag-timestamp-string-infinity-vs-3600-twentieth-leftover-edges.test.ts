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
 * nineteenth pins `{}` NaN throw / `[60]` finite. Exact string `"Infinity"`
 * → parseFloat Infinity → formatTimestamp RangeError; numeric string
 * `"3600"` → finite epoch+3600ms memory (oauth2-style residual).
 */
describe("vertex-rag timestamp string-infinity vs 3600 twentieth leftover", () => {
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

	it('timestamp "3600" → parseFloat 3600 → epoch+3600ms memory', async () => {
		expect(Number.parseFloat("3600")).toBe(3600);
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify({
							author: "a",
							timestamp: "3600",
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
		expect(result.memories[0].timestamp).toBe(new Date(3600).toISOString());
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
