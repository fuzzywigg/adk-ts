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
 * Fifteenth leftover: parsed JSON `author || ""` / `text || ""` — fifth
 * coalesces falsy 0/false/"" to ""; twelfth keeps whitespace. String `"0"` /
 * `"false"` are truthy and kept literally.
 */
describe("vertex-rag json author/text string-zero-false keep fifteenth leftover", () => {
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

	it.each([
		{
			label: 'author "0" text "false"',
			payload: { author: "0", timestamp: 1, text: "false" },
			expectAuthor: "0",
			expectText: "false",
		},
		{
			label: 'author "false" text "0"',
			payload: { author: "false", timestamp: 2, text: "0" },
			expectAuthor: "false",
			expectText: "0",
		},
	])("keeps $label from parsed JSON", async ({
		payload,
		expectAuthor,
		expectText,
	}) => {
		const service = new VertexAiRagMemoryService("corpus-15");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify(payload),
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
		expect(result.memories[0].author).toBe(expectAuthor);
		expect(result.memories[0].content?.parts?.[0]?.text).toBe(expectText);
	});

	it("numeric 0 author still coalesces to empty (fifth control)", async () => {
		const service = new VertexAiRagMemoryService("corpus-15");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({ author: 0, timestamp: 1, text: "t" }),
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
		expect(result.memories[0].content?.parts?.[0]?.text).toBe("t");
	});
});
