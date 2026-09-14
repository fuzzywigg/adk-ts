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
 * Seventeenth leftover: `eventData.timestamp || "0"` then parseFloat —
 * fourteenth boolean `false` coalesces to `"0"` → epoch. Boolean `true` is
 * truthy → parseFloat(true) → NaN → formatTimestamp RangeError (asymmetry
 * vs false coalesce; twin of sixteenth string `"false"` NaN path).
 */
describe("vertex-rag timestamp boolean-true nan-throw seventeenth leftover", () => {
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

	it("timestamp true → parseFloat NaN → formatTimestamp RangeError", async () => {
		expect(Number.isNaN(Number.parseFloat(true as any))).toBe(true);
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify({
							author: "a",
							timestamp: true,
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

	it('boolean false still coalesces via || "0" → epoch (fourteenth control)', async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify({
							author: "a",
							timestamp: false,
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
});
