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
 * Twenty-first leftover residual deepen (complements #287 bare Infinity skip /
 * `"false"` empty memory): JSON *string* primitive `"\"Infinity\""` parses to
 * string `"Infinity"` → property access yields undefined → empty author/text
 * epoch memory (valid-JSON empty path, NOT the bare-Infinity invalid-JSON
 * skip). JSON `"1"` control still empty-memory.
 */
describe("vertex-rag context-text json-primitive quoted-infinity twenty-first residual deepen", () => {
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

	it('JSON string primitive "\\"Infinity\\"" yields empty author/text epoch memory', async () => {
		expect(JSON.parse('"Infinity"')).toBe("Infinity");
		expect(("Infinity" as any).author).toBeUndefined();
		const service = new VertexAiRagMemoryService("corpus-21");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: '"Infinity"',
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
		expect(result.memories[0].content?.parts?.[0]?.text).toBe("");
		expect(result.memories[0].timestamp).toBe(new Date(0).toISOString());
	});

	it('bare "Infinity" still skipped (twentieth control)', async () => {
		expect(() => JSON.parse("Infinity")).toThrow();
		const service = new VertexAiRagMemoryService("corpus-21");
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

	it('JSON "1" still yields empty memory (eighteenth control)', async () => {
		const service = new VertexAiRagMemoryService("corpus-21");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: "1",
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

	it('JSON "false" still yields empty memory (twentieth control)', async () => {
		const service = new VertexAiRagMemoryService("corpus-21");
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
});
