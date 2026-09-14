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
import type { Session } from "../../sessions/session";
import type { Event } from "../../events/event";

/**
 * Fifteenth leftover: ctor `ragCorpus ? [{ rag_corpus }] : []` — fifth pins
 * falsy `""`/null/undefined empty + whitespace wires. String `"0"` /
 * `"false"` are truthy and wire rag_resources.
 */
describe("vertex-rag corpus string-zero-false truthy fifteenth leftover", () => {
	function makeSession(): Session {
		return {
			id: "sess",
			appName: "app",
			userId: "user",
			state: {},
			events: [
				{
					author: "user",
					timestamp: 1,
					content: { parts: [{ text: "hello" }] },
				} as Event,
			],
			lastUpdateTime: 1,
		};
	}

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
		{ label: '"0"', ragCorpus: "0" },
		{ label: '"false"', ragCorpus: "false" },
	])("$label ragCorpus wires rag_resources", async ({ ragCorpus }) => {
		const service = new VertexAiRagMemoryService(ragCorpus);
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(makeSession());
		expect(upload).toHaveBeenCalledWith(
			expect.objectContaining({ corpus_name: ragCorpus }),
		);
	});

	it("empty-string ragCorpus still rejects (fifth control)", async () => {
		const service = new VertexAiRagMemoryService("");
		await expect(service.addSessionToMemory(makeSession())).rejects.toThrow(
			/Rag resources must be set/,
		);
	});
});
