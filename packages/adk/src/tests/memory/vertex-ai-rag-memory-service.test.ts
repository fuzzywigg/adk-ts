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
import type { Session } from "../../sessions/session";

function event(author: string, timestamp: number, text?: string): Event {
	return {
		author,
		timestamp,
		...(text !== undefined ? { content: { parts: [{ text }] } } : {}),
	} as Event;
}

function jsonLine(
	author: string,
	timestamp: number | string,
	text: string,
): string {
	return JSON.stringify({ author, timestamp, text });
}

describe("_mergeEventLists", () => {
	it("returns empty when given no lists", () => {
		expect(_mergeEventLists([])).toEqual([]);
	});

	it("returns a single list unchanged when there is nothing to merge", () => {
		const only = [event("a", 1, "one"), event("b", 2, "two")];
		expect(_mergeEventLists([only])).toEqual([only]);
	});

	it("keeps non-overlapping timestamp lists as separate groups", () => {
		const left = [event("a", 1, "a"), event("b", 2, "b")];
		const right = [event("c", 10, "c"), event("d", 11, "d")];
		expect(_mergeEventLists([left, right])).toEqual([left, right]);
	});

	it("merges lists that share a timestamp into one group", () => {
		const first = [event("a", 1, "a"), event("b", 5, "b")];
		const second = [event("c", 5, "c-dup-ts"), event("d", 9, "d")];
		const merged = _mergeEventLists([first, second]);

		expect(merged).toHaveLength(1);
		expect(merged[0].map((e) => e.timestamp).sort((a, b) => a - b)).toEqual([
			1, 5, 9,
		]);
		expect(merged[0].find((e) => e.timestamp === 5)?.author).toBe("b");
		expect(merged[0].some((e) => e.author === "c")).toBe(false);
	});

	it("transitively merges A∩B and B∩C even when A and C share no timestamps", () => {
		const a = [event("a", 1, "a"), event("shared-ab", 2, "ab")];
		const b = [event("b", 2, "b"), event("shared-bc", 3, "bc")];
		const c = [event("c", 3, "c"), event("tail", 4, "tail")];
		const merged = _mergeEventLists([a, b, c]);

		expect(merged).toHaveLength(1);
		expect(merged[0].map((e) => e.timestamp).sort((a, b) => a - b)).toEqual([
			1, 2, 3, 4,
		]);
	});

	it("does not double-insert events whose timestamps already exist", () => {
		const first = [event("keep", 7, "first"), event("also", 8, "x")];
		const second = [event("drop", 7, "second"), event("new", 9, "y")];
		const merged = _mergeEventLists([first, second]);

		expect(merged).toHaveLength(1);
		expect(merged[0]).toHaveLength(3);
		expect(merged[0].filter((e) => e.timestamp === 7)).toHaveLength(1);
		expect(merged[0].find((e) => e.timestamp === 7)?.author).toBe("keep");
	});

	it("preserves later non-overlapping groups after an earlier merge", () => {
		const overlappingA = [event("a", 1, "a")];
		const overlappingB = [event("b", 1, "b"), event("extra", 2, "e")];
		const isolated = [event("z", 100, "z")];
		const merged = _mergeEventLists([overlappingA, overlappingB, isolated]);

		expect(merged).toHaveLength(2);
		expect(merged[0].map((e) => e.timestamp).sort((a, b) => a - b)).toEqual([
			1, 2,
		]);
		expect(merged[1]).toEqual(isolated);
	});

	it("handles empty inner lists without inventing timestamps", () => {
		const empty: Event[] = [];
		const populated = [event("a", 3, "a")];
		const merged = _mergeEventLists([empty, populated]);

		expect(merged).toHaveLength(2);
		expect(merged[0]).toEqual([]);
		expect(merged[1]).toEqual(populated);
	});

	it("mutates the input array length as lists are consumed", () => {
		const input: Event[][] = [[event("a", 1, "a")], [event("b", 2, "b")]];
		_mergeEventLists(input);
		expect(input).toHaveLength(0);
	});
});

describe("VertexAiRagMemoryService", () => {
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
		expect(writeFileSync).toHaveBeenCalledWith(
			expect.any(String),
			jsonLine("user", 3, "line one.two"),
			"utf8",
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
		expect(writeFileSync).toHaveBeenCalledWith(
			expect.any(String),
			jsonLine("user", 10, "line one.two three"),
			"utf8",
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
		expect(writeFileSync).toHaveBeenCalledWith(expect.any(String), "", "utf8");
		expect(console.log).toHaveBeenCalledWith(
			"Mock upload_file:",
			expect.objectContaining({
				corpus_name: "corpus-empty",
				display_name: "demo.alice.sess-empty",
			}),
		);
	});

	it("addSessionToMemory with zero events uploads an empty payload", async () => {
		const service = new VertexAiRagMemoryService("corpus-zero");
		const session: Session = {
			id: "sess-zero",
			appName: "demo",
			userId: "alice",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};

		await expect(service.addSessionToMemory(session)).resolves.toBeUndefined();
		expect(writeFileSync).toHaveBeenCalledWith(expect.any(String), "", "utf8");
	});

	it("addSessionToMemory writes one JSONL line per text-bearing event", async () => {
		const service = new VertexAiRagMemoryService("corpus-jsonl");
		const session: Session = {
			id: "sess-jsonl",
			appName: "demo",
			userId: "alice",
			state: {},
			events: [
				{
					author: "user",
					timestamp: 1,
					content: { parts: [{ text: "alpha" }] },
				} as Event,
				{
					author: "agent",
					timestamp: 2,
					content: { parts: [{ text: "beta" }] },
				} as Event,
			],
			lastUpdateTime: 2,
		};

		await service.addSessionToMemory(session);
		expect(writeFileSync).toHaveBeenCalledWith(
			expect.any(String),
			`${jsonLine("user", 1, "alpha")}\n${jsonLine("agent", 2, "beta")}`,
			"utf8",
		);
	});
});

describe("VertexAiRagMemoryService.searchMemory retrieval edges", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("filters contexts that do not match appName.userId prefix", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "other.bob.sess-1",
						text: jsonLine("user", 1, "ignored"),
					},
					{
						source_display_name: "demo.alice.sess-1",
						text: jsonLine("user", 2, "kept"),
					},
				],
			},
		});

		const service = new VertexAiRagMemoryService("corpus-1");
		const result = await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "kept",
		});

		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].content.parts?.[0]?.text).toBe("kept");
		expect(result.memories[0].author).toBe("user");
	});

	it("does not treat userId as a prefix of a longer user id", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "demo.alice2.sess-1",
						text: jsonLine("user", 1, "should-not-match"),
					},
				],
			},
		});

		const service = new VertexAiRagMemoryService("corpus-1");
		const result = await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "anything",
		});

		expect(result.memories).toEqual([]);
	});

	it("derives session id from the last dotted segment of display name", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "demo.alice.folder.nested.sess-9",
						text: jsonLine("user", 5, "nested"),
					},
				],
			},
		});

		const service = new VertexAiRagMemoryService("corpus-1");
		const result = await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "nested",
		});

		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].content.parts?.[0]?.text).toBe("nested");
	});

	it("skips blank lines and invalid JSON while keeping valid siblings", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "demo.alice.sess-parse",
						text: [
							"",
							"   ",
							"not-json",
							jsonLine("user", 10, "first"),
							"{broken",
							jsonLine("agent", 20, "second"),
						].join("\n"),
					},
				],
			},
		});

		const service = new VertexAiRagMemoryService("corpus-1");
		const result = await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "parse",
		});

		expect(result.memories.map((m) => m.content.parts?.[0]?.text)).toEqual([
			"first",
			"second",
		]);
	});

	it("defaults missing author/timestamp/text fields when JSON omits them", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "demo.alice.sess-defaults",
						text: JSON.stringify({}),
					},
				],
			},
		});

		const service = new VertexAiRagMemoryService("corpus-1");
		const result = await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "defaults",
		});

		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].author).toBe("");
		expect(result.memories[0].content.parts?.[0]?.text).toBe("");
		expect(result.memories[0].timestamp).toBe(new Date(0).toISOString());
	});

	it("parses string timestamps via Number.parseFloat", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "demo.alice.sess-ts",
						text: jsonLine("user", "1700.5", "string-ts"),
					},
				],
			},
		});

		const service = new VertexAiRagMemoryService("corpus-1");
		const result = await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "ts",
		});

		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].timestamp).toBe(new Date(1700.5).toISOString());
	});

	it("ignores contexts with undefined or empty text", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{ source_display_name: "demo.alice.sess-a" },
					{ source_display_name: "demo.alice.sess-b", text: "" },
					{
						source_display_name: "demo.alice.sess-c",
						text: jsonLine("user", 1, "only"),
					},
				],
			},
		});

		const service = new VertexAiRagMemoryService("corpus-1");
		const result = await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "only",
		});

		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].content.parts?.[0]?.text).toBe("only");
	});

	it("merges overlapping contexts for the same session and sorts by timestamp", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "demo.alice.sess-merge",
						text: [
							jsonLine("user", 30, "third"),
							jsonLine("user", 10, "first"),
						].join("\n"),
					},
					{
						source_display_name: "demo.alice.sess-merge",
						text: [
							jsonLine("agent", 10, "overlap-dropped"),
							jsonLine("agent", 20, "second"),
						].join("\n"),
					},
				],
			},
		});

		const service = new VertexAiRagMemoryService("corpus-1");
		const result = await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "merge",
		});

		expect(result.memories.map((m) => m.content.parts?.[0]?.text)).toEqual([
			"first",
			"second",
			"third",
		]);
		expect(result.memories.map((m) => m.author)).toEqual([
			"user",
			"agent",
			"user",
		]);
	});

	it("keeps separate sessions independent after search", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "demo.alice.sess-a",
						text: jsonLine("user", 1, "from-a"),
					},
					{
						source_display_name: "demo.alice.sess-b",
						text: jsonLine("user", 1, "from-b"),
					},
				],
			},
		});

		const service = new VertexAiRagMemoryService("corpus-1");
		const result = await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "from",
		});

		expect(
			result.memories.map((m) => m.content.parts?.[0]?.text).sort(),
		).toEqual(["from-a", "from-b"]);
	});

	it("transitively merges three overlapping contexts for one session", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "demo.alice.sess-chain",
						text: [jsonLine("a", 1, "a"), jsonLine("ab", 2, "ab")].join("\n"),
					},
					{
						source_display_name: "demo.alice.sess-chain",
						text: [jsonLine("bc", 2, "bc"), jsonLine("c", 3, "c")].join("\n"),
					},
					{
						source_display_name: "demo.alice.sess-chain",
						text: [jsonLine("cd", 3, "cd"), jsonLine("d", 4, "d")].join("\n"),
					},
				],
			},
		});

		const service = new VertexAiRagMemoryService("corpus-1");
		const result = await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "chain",
		});

		expect(result.memories.map((m) => m.content.parts?.[0]?.text)).toEqual([
			"a",
			"ab",
			"c",
			"d",
		]);
	});

	it("emits formatTimestamp ISO strings for numeric event timestamps", async () => {
		const ts = Date.parse("2024-06-15T12:00:00.000Z");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "demo.alice.sess-iso",
						text: jsonLine("user", ts, "iso"),
					},
				],
			},
		});

		const service = new VertexAiRagMemoryService("corpus-1");
		const result = await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "iso",
		});

		expect(result.memories[0].timestamp).toBe("2024-06-15T12:00:00.000Z");
	});

	it("returns empty memories when all contexts are filtered out", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "prod.other.sess-1",
						text: jsonLine("user", 1, "nope"),
					},
				],
			},
		});

		const service = new VertexAiRagMemoryService("corpus-1", 4, 0.9);
		const result = await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "nope",
		});

		expect(result).toEqual({ memories: [] });
		expect(rag.retrieval_query).toHaveBeenCalledWith(
			expect.objectContaining({
				text: "nope",
				similarity_top_k: 4,
				vector_distance_threshold: 0.9,
				rag_resources: [{ rag_corpus: "corpus-1" }],
			}),
		);
	});

	it("still forwards rag_corpora when retrieval returns matching contexts", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "demo.alice.sess-fwd",
						text: jsonLine("user", 1, "forwarded"),
					},
				],
			},
		});

		const service = new VertexAiRagMemoryService("corpus-1", 2, 3);
		(service as any)._vertexRagStore.rag_corpora = ["legacy-a", "legacy-b"];

		const result = await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "forwarded",
		});

		expect(result.memories).toHaveLength(1);
		expect(rag.retrieval_query).toHaveBeenCalledWith(
			expect.objectContaining({
				rag_corpora: ["legacy-a", "legacy-b"],
				similarity_top_k: 2,
				vector_distance_threshold: 3,
			}),
		);
	});

	it("keeps non-overlapping context groups for the same session as separate streams", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "demo.alice.sess-split",
						text: jsonLine("user", 1, "early"),
					},
					{
						source_display_name: "demo.alice.sess-split",
						text: jsonLine("user", 100, "late"),
					},
				],
			},
		});

		const service = new VertexAiRagMemoryService("corpus-1");
		const result = await service.searchMemory({
			appName: "demo",
			userId: "alice",
			query: "split",
		});

		expect(result.memories.map((m) => m.content.parts?.[0]?.text)).toEqual([
			"early",
			"late",
		]);
	});
});
