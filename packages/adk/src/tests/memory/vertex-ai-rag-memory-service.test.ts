import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { unlinkSync } = vi.hoisted(() => ({
	unlinkSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		unlinkSync,
	};
});

import type { Event } from "../../events/event";
import { VertexAiRagMemoryService } from "../../memory/vertex-ai-rag-memory-service";
import type { Session } from "../../sessions/session";

describe("VertexAiRagMemoryService", () => {
	beforeEach(() => {
		unlinkSync.mockReset();
		unlinkSync.mockImplementation(() => undefined);
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("constructs with defaults and optional corpus/topK/threshold", () => {
		const empty = new VertexAiRagMemoryService();
		expect(empty).toBeInstanceOf(VertexAiRagMemoryService);

		const configured = new VertexAiRagMemoryService(
			"projects/p/locations/l/ragCorpora/c1",
			5,
			0.4,
		);
		expect(configured).toBeInstanceOf(VertexAiRagMemoryService);
	});

	it("addSessionToMemory throws when no rag resources are configured", async () => {
		const service = new VertexAiRagMemoryService();
		const session: Session = {
			id: "s1",
			appName: "app",
			userId: "u",
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

		await expect(service.addSessionToMemory(session)).rejects.toThrow(
			/Rag resources must be set/,
		);
	});

	it("addSessionToMemory skips events without text parts and uploads temp content", async () => {
		const service = new VertexAiRagMemoryService("corpus-1");
		const session: Session = {
			id: "sess-9",
			appName: "demo",
			userId: "alice",
			state: {},
			events: [
				{ author: "system", timestamp: 1 } as Event,
				{
					author: "user",
					timestamp: 2,
					content: { parts: [{ inlineData: { data: "x" } } as any] },
				} as Event,
				{
					author: "user",
					timestamp: 3,
					content: {
						parts: [{ text: "line\none" }, { text: "two" }],
					},
				} as Event,
			],
			lastUpdateTime: 3,
		};

		await expect(service.addSessionToMemory(session)).resolves.toBeUndefined();
		expect(console.log).toHaveBeenCalledWith(
			"Mock upload_file:",
			expect.objectContaining({
				corpus_name: "corpus-1",
				display_name: "demo.alice.sess-9",
			}),
		);
		expect(unlinkSync).toHaveBeenCalled();
	});

	it("searchMemory returns empty memories from the built-in mock retrieval", async () => {
		const service = new VertexAiRagMemoryService("corpus-1", 3, 2);
		const result = await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "what happened",
		});

		expect(result).toEqual({ memories: [] });
		expect(console.log).toHaveBeenCalledWith(
			"Mock retrieval_query:",
			expect.objectContaining({
				text: "what happened",
				similarity_top_k: 3,
				vector_distance_threshold: 2,
				rag_resources: [{ rag_corpus: "corpus-1" }],
			}),
		);
	});

	it("addSessionToMemory warns when temp file cleanup fails", async () => {
		unlinkSync.mockImplementation(() => {
			throw new Error("ENOENT");
		});

		const service = new VertexAiRagMemoryService("corpus-cleanup");
		const session: Session = {
			id: "sess-cleanup",
			appName: "demo",
			userId: "alice",
			state: {},
			events: [
				{
					author: "user",
					timestamp: 1,
					content: { parts: [{ text: "persist me" }] },
				} as Event,
			],
			lastUpdateTime: 1,
		};

		await expect(service.addSessionToMemory(session)).resolves.toBeUndefined();
		expect(console.warn).toHaveBeenCalledWith(
			"Failed to delete temporary file:",
			expect.any(String),
			expect.any(Error),
		);
		expect(unlinkSync).toHaveBeenCalled();
	});

	it("uploads to every configured rag resource and joins multi-line text", async () => {
		const service = new VertexAiRagMemoryService("corpus-primary");
		(service as any)._vertexRagStore.rag_resources = [
			{ rag_corpus: "corpus-a" },
			{ rag_corpus: "corpus-b" },
		];

		const session: Session = {
			id: "sess-multi",
			appName: "demo",
			userId: "alice",
			state: {},
			events: [
				{
					author: "user",
					timestamp: 10,
					content: {
						parts: [{ text: "line\none" }, { text: "two\nthree" }],
					},
				} as Event,
			],
			lastUpdateTime: 10,
		};

		await expect(service.addSessionToMemory(session)).resolves.toBeUndefined();
		expect(console.log).toHaveBeenCalledWith(
			"Mock upload_file:",
			expect.objectContaining({
				corpus_name: "corpus-a",
				display_name: "demo.alice.sess-multi",
			}),
		);
		expect(console.log).toHaveBeenCalledWith(
			"Mock upload_file:",
			expect.objectContaining({ corpus_name: "corpus-b" }),
		);
	});

	it("searchMemory passes rag_corpora when set on the store", async () => {
		const service = new VertexAiRagMemoryService("corpus-1", 7, 1.5);
		(service as any)._vertexRagStore.rag_corpora = ["legacy-corpus"];

		await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "status",
		});

		expect(console.log).toHaveBeenCalledWith(
			"Mock retrieval_query:",
			expect.objectContaining({
				text: "status",
				rag_corpora: ["legacy-corpus"],
				similarity_top_k: 7,
				vector_distance_threshold: 1.5,
			}),
		);
	});

	it("addSessionToMemory with only non-text events still uploads empty payload", async () => {
		const service = new VertexAiRagMemoryService("corpus-empty");
		const session: Session = {
			id: "sess-empty",
			appName: "demo",
			userId: "alice",
			state: {},
			events: [
				{ author: "system", timestamp: 1 } as Event,
				{
					author: "user",
					timestamp: 2,
					content: { parts: [{ functionCall: { name: "x", args: {} } }] },
				} as Event,
			],
			lastUpdateTime: 2,
		};

		await expect(service.addSessionToMemory(session)).resolves.toBeUndefined();
		expect(console.log).toHaveBeenCalledWith(
			"Mock upload_file:",
			expect.objectContaining({
				corpus_name: "corpus-empty",
				display_name: "demo.alice.sess-empty",
			}),
		);
	});
});
