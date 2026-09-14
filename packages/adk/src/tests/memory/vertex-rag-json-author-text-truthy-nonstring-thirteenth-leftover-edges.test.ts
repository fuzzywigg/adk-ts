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
 * Thirteenth leftover: JSON `author || ""` / `text || ""` keep truthy
 * non-strings. Fifth coalesces falsy; twelfth keeps whitespace strings.
 */
describe("vertex-rag json author/text truthy nonstring thirteenth leftover", () => {
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

	it("keeps numeric author and boolean text from parsed JSON", async () => {
		const service = new VertexAiRagMemoryService("corpus");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: 5,
							timestamp: 1,
							text: true,
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
		expect(result.memories[0].author).toBe(5);
		expect(result.memories[0].content).toEqual({ parts: [{ text: true }] });
	});

	it('timestamp false parses to epoch via parseFloat(false||"0")', async () => {
		const service = new VertexAiRagMemoryService("corpus");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: "u",
							timestamp: false,
							text: "ok",
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
		expect(result.memories[0].timestamp).toBe(new Date(0).toISOString());
	});

	it("falsy author/text still coalesce to empty string (fifth control)", async () => {
		const service = new VertexAiRagMemoryService("corpus");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: 0,
							timestamp: 1,
							text: "",
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
		expect(result.memories[0].content).toEqual({ parts: [{ text: "" }] });
	});
});
