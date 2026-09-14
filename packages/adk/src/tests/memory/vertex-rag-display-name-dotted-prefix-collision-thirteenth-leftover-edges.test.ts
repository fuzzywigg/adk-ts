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
 * Thirteenth leftover: display_name filter uses
 * `startsWith(\`${appName}.${userId}.\`)`. Dotted app/user identities
 * create false-positive prefix matches (parity with in-memory slash collision).
 */
describe("vertex-rag display-name dotted prefix collision thirteenth leftover", () => {
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

	it("store foo+bar.baz matches search foo.bar+baz via startsWith", async () => {
		const service = new VertexAiRagMemoryService("corpus");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "foo.bar.baz.s1",
						text: JSON.stringify({
							author: "u",
							timestamp: 1,
							text: "payload",
						}),
					},
				],
			},
		});

		const asStored = await service.searchMemory({
			appName: "foo",
			userId: "bar.baz",
			query: "q",
		});
		expect(asStored.memories).toHaveLength(1);

		const asCollision = await service.searchMemory({
			appName: "foo.bar",
			userId: "baz",
			query: "q",
		});
		expect(asCollision.memories).toHaveLength(1);
	});

	it("unrelated prefix still filtered out (fifth control)", async () => {
		const service = new VertexAiRagMemoryService("corpus");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "foo.bar.baz.s1",
						text: JSON.stringify({
							author: "u",
							timestamp: 1,
							text: "payload",
						}),
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName: "other",
			userId: "user",
			query: "q",
		});
		expect(result.memories).toEqual([]);
	});
});
