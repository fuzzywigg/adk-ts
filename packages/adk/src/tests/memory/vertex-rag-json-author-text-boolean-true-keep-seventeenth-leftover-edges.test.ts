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
 * Seventeenth leftover: parsed JSON `author || ""` / `text || ""` — fifteenth
 * keeps string `"0"` / `"false"`. Boolean `true` is truthy and kept as the
 * boolean value (not coalesced to "").
 */
describe("vertex-rag json author/text boolean-true keep seventeenth leftover", () => {
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

	it("keeps boolean true author and text from parsed JSON", async () => {
		const service = new VertexAiRagMemoryService("corpus-17");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: true,
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
		expect(result.memories[0].author).toBe(true);
		expect(result.memories[0].content?.parts?.[0]?.text).toBe(true);
	});

	it('string "false" author still kept (fifteenth control)', async () => {
		const service = new VertexAiRagMemoryService("corpus-17");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: "false",
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
		expect(result.memories[0].author).toBe("false");
	});

	it("boolean false author still coalesces to empty (fifth control)", async () => {
		const service = new VertexAiRagMemoryService("corpus-17");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: false,
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
		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].author).toBe("");
	});
});
