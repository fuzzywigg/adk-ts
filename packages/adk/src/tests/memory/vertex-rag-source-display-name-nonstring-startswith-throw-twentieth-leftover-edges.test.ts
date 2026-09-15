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
 * Twentieth leftover: `context.source_display_name.startsWith(...)` —
 * prior leftovers only pin string prefix / case. Truthy non-string
 * `true` / `1` / `{}` / `[]` throw TypeError before session parse
 * (same startsWith-throw family as auth-preprocessor twentieth).
 */
describe("vertex-rag source_display_name nonstring startsWith-throw twentieth leftover", () => {
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
		{ label: "boolean true", source: true },
		{ label: "number 1", source: 1 },
		{ label: "empty object {}", source: {} },
		{ label: "empty array []", source: [] },
	])("source_display_name $label → startsWith TypeError", async ({
		source,
	}) => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: source as any,
						text: JSON.stringify({
							author: "a",
							timestamp: 1,
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
		).rejects.toThrow(/startsWith is not a function/);
	});

	it("string prefix still matches (fifth control)", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify({
							author: "a",
							timestamp: 1,
							text: "hello",
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
		expect(result.memories[0].author).toBe("a");
	});
});
