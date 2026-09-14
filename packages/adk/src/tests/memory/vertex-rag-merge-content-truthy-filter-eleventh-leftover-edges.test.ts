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

import type { Event } from "../../events/event";
import {
	_mergeEventLists,
	rag,
	VertexAiRagMemoryService,
} from "../../memory/vertex-ai-rag-memory-service";

/**
 * Eleventh leftover: `_mergeEventLists` preserves events that lack `content`
 * (no content filter inside merge). Downstream searchMemory filters with
 * `event.content` truthiness — empty `{}` kept, missing dropped — exercised
 * here by feeding merge output shapes through the exported merge helper then
 * applying the same truthiness predicate the service uses.
 */
describe("vertex-rag merge preserves contentless + truthy filter eleventh leftover", () => {
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

	it("_mergeEventLists keeps events without content (no filter in merge)", () => {
		const missing = { author: "a", timestamp: 1 } as Event;
		const withContent = {
			author: "b",
			timestamp: 2,
			content: { parts: [{ text: "x" }] },
		} as Event;
		const merged = _mergeEventLists([[missing, withContent]]);
		expect(merged).toHaveLength(1);
		expect(merged[0]).toHaveLength(2);
		expect(merged[0][0]).toBe(missing);
		expect((merged[0][0] as Event).content).toBeUndefined();
	});

	it("searchMemory parsed path always builds truthy content even for empty text", async () => {
		const service = new VertexAiRagMemoryService("corpus-11");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text: JSON.stringify({
							author: "u",
							timestamp: "1",
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
		// parsed path always builds content: { parts: [{ text }] } — truthy even for ""
		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].content).toEqual({ parts: [{ text: "" }] });
		expect(result.memories[0].author).toBe("u");
	});
});
