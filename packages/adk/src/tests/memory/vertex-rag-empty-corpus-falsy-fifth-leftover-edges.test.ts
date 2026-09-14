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

function makeSession(overrides?: Partial<Session>): Session {
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
		...overrides,
	};
}

describe("VertexAiRagMemoryService empty ragCorpus falsy fifth leftover", () => {
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
		{ label: "empty-string", ragCorpus: "" },
		{ label: "null", ragCorpus: null as any },
		{ label: "undefined", ragCorpus: undefined },
	])("$label ragCorpus yields empty rag_resources via truthy ?", async ({
		ragCorpus,
	}) => {
		const service = new VertexAiRagMemoryService(ragCorpus);
		await expect(service.addSessionToMemory(makeSession())).rejects.toThrow(
			/Rag resources must be set/,
		);
	});

	it("whitespace-only ragCorpus is truthy and wires rag_resources", async () => {
		const service = new VertexAiRagMemoryService("   ");
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(makeSession());
		expect(upload).toHaveBeenCalledWith(
			expect.objectContaining({ corpus_name: "   " }),
		);
	});

	it("truthy corpus id keeps single rag_resource entry", async () => {
		const service = new VertexAiRagMemoryService("projects/p/ragCorpora/c1");
		const retrieval = vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: { contexts: [] },
		});
		await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(retrieval).toHaveBeenCalledWith(
			expect.objectContaining({
				rag_resources: [{ rag_corpus: "projects/p/ragCorpora/c1" }],
			}),
		);
	});

	it("similarityTopK undefined is forwarded as undefined (not coalesced)", async () => {
		const service = new VertexAiRagMemoryService("c");
		const retrieval = vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: { contexts: [] },
		});
		await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(retrieval.mock.calls[0][0].similarity_top_k).toBeUndefined();
		expect(retrieval.mock.calls[0][0].vector_distance_threshold).toBe(10);
	});
});
