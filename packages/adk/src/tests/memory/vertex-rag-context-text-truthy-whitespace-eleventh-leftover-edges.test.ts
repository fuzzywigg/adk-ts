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
 * Eleventh leftover: searchMemory `if (context.text)` — empty/missing skip the
 * parse block (fourth leftover); whitespace-only is truthy, enters, then
 * `!trimmedLine` drops every line → empty memories.
 */
describe("vertex-rag context.text truthy whitespace eleventh leftover edges", () => {
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
		{ label: "single space", text: " " },
		{ label: "newlines only", text: "\n\n" },
		{ label: "tabs/spaces", text: "\t  \t" },
		{ label: "mixed whitespace lines", text: "  \n\t\n   " },
	])("truthy whitespace context.text $label yields no memories", async ({
		text,
	}) => {
		const service = new VertexAiRagMemoryService("corpus-11");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text,
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

	it.each([
		{ label: "empty string", text: "" },
		{ label: "undefined", text: undefined },
		{ label: "null", text: null },
	])("falsy context.text $label skips parse block (control)", async ({
		text,
	}) => {
		const service = new VertexAiRagMemoryService("corpus-11");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						...(text === undefined ? {} : { text }),
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

	it("whitespace lines among valid JSON keep only non-blank lines", async () => {
		const service = new VertexAiRagMemoryService("corpus-11");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: [
							"   ",
							JSON.stringify({ author: "u", timestamp: "1", text: "kept" }),
							"\t",
						].join("\n"),
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
		expect(result.memories[0].author).toBe("u");
		expect(result.memories[0].content).toEqual({ parts: [{ text: "kept" }] });
	});
});
