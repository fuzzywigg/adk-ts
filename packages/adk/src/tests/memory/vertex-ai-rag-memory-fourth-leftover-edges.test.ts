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

function makeSession(overrides?: Partial<Session>): Session {
	return {
		id: "sess-4",
		appName: "app",
		userId: "user",
		state: {},
		events: [
			{
				author: "user",
				timestamp: 1,
				content: { parts: [{ text: "hello world" }] },
			} as Event,
		],
		lastUpdateTime: 1,
		...overrides,
	};
}

describe("VertexAiRagMemoryService fourth leftover matrices (mocked)", () => {
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

	it("constructs with defaults and optional args", () => {
		expect(new VertexAiRagMemoryService()).toBeInstanceOf(
			VertexAiRagMemoryService,
		);
		expect(new VertexAiRagMemoryService("corpus-x", 3, 0.5)).toBeInstanceOf(
			VertexAiRagMemoryService,
		);
	});

	it("addSessionToMemory throws when rag resources empty", async () => {
		const service = new VertexAiRagMemoryService();
		await expect(service.addSessionToMemory(makeSession())).rejects.toThrow(
			/Rag resources must be set/,
		);
	});

	it("addSessionToMemory uploads display_name and cleans temp file", async () => {
		const service = new VertexAiRagMemoryService("corpus-1");
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(
			makeSession({
				appName: "demo",
				userId: "alice",
				id: "s9",
				events: [
					{ author: "skip", timestamp: 1 } as Event,
					{
						author: "user",
						timestamp: 2,
						content: {
							parts: [{ text: "line\none" }, { text: "two" }],
						},
					} as Event,
				],
			}),
		);
		expect(upload).toHaveBeenCalledWith(
			expect.objectContaining({
				corpus_name: "corpus-1",
				display_name: "demo.alice.s9",
			}),
		);
		expect(writeFileSync).toHaveBeenCalledWith(
			expect.any(String),
			jsonLine("user", 2, "line one.two"),
			"utf8",
		);
		expect(unlinkSync).toHaveBeenCalled();
	});

	it("addSessionToMemory skips events without text parts", async () => {
		const service = new VertexAiRagMemoryService("c");
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(
			makeSession({
				events: [
					{ author: "a", timestamp: 1 } as Event,
					{
						author: "b",
						timestamp: 2,
						content: { parts: [{ inlineData: { data: "x" } } as any] },
					} as Event,
					{
						author: "c",
						timestamp: 3,
						content: { parts: [{ text: "kept" }] },
					} as Event,
				],
			}),
		);
		expect(writeFileSync.mock.calls[0][1]).toBe(jsonLine("c", 3, "kept"));
		expect(upload).toHaveBeenCalled();
	});

	it("addSessionToMemory with empty text events writes empty file content", async () => {
		const service = new VertexAiRagMemoryService("c");
		vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(
			makeSession({
				events: [{ author: "a", timestamp: 1 } as Event],
			}),
		);
		expect(writeFileSync).toHaveBeenCalledWith(expect.any(String), "", "utf8");
	});

	it("searchMemory filters by app.user prefix on source_display_name", async () => {
		const service = new VertexAiRagMemoryService("c");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: jsonLine("u", 1, "match me"),
					},
					{
						source_display_name: "other.user.s2",
						text: jsonLine("x", 2, "ignore"),
					},
					{
						source_display_name: "app.other.s3",
						text: jsonLine("y", 3, "ignore"),
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
		expect(result.memories[0].content.parts?.[0]?.text).toBe("match me");
	});

	it("searchMemory skips blank lines and invalid JSON", async () => {
		const service = new VertexAiRagMemoryService("c");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: `\n\nnot-json\n${jsonLine("ok", 5, "valid")}\n`,
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
		expect(result.memories[0].author).toBe("ok");
	});

	it("searchMemory coalesces missing author/timestamp/text fields", async () => {
		const service = new VertexAiRagMemoryService("c");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify({}),
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
		expect(result.memories[0].content.parts?.[0]?.text).toBe("");
	});

	it("searchMemory merges overlapping session event lists", async () => {
		const service = new VertexAiRagMemoryService("c");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.same",
						text: `${jsonLine("a", 1, "one")}\n${jsonLine("b", 2, "two")}`,
					},
					{
						source_display_name: "app.user.same",
						text: `${jsonLine("c", 2, "dup")}\n${jsonLine("d", 3, "three")}`,
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		const authors = result.memories.map((m) => m.author);
		expect(authors).toEqual(expect.arrayContaining(["a", "b", "d"]));
		expect(authors).not.toContain("c");
		expect(result.memories).toHaveLength(3);
	});

	it("searchMemory returns empty when no contexts", async () => {
		const service = new VertexAiRagMemoryService("c");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: { contexts: [] },
		});
		await expect(
			service.searchMemory({ appName: "app", userId: "user", query: "q" }),
		).resolves.toEqual({ memories: [] });
	});

	it("searchMemory forwards retrieval options from constructor", async () => {
		const service = new VertexAiRagMemoryService("corpus-z", 7, 0.25);
		const retrieval = vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: { contexts: [] },
		});
		await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "needle",
		});
		expect(retrieval).toHaveBeenCalledWith({
			text: "needle",
			rag_resources: [{ rag_corpus: "corpus-z" }],
			rag_corpora: undefined,
			similarity_top_k: 7,
			vector_distance_threshold: 0.25,
		});
	});

	it("searchMemory skips contexts without text", async () => {
		const service = new VertexAiRagMemoryService("c");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{ source_display_name: "app.user.s1" },
					{
						source_display_name: "app.user.s1",
						text: jsonLine("z", 9, "kept"),
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(result.memories.map((m) => m.author)).toEqual(["z"]);
	});

	it("warns when temp unlink fails after upload", async () => {
		const service = new VertexAiRagMemoryService("c");
		vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		unlinkSync.mockImplementation(() => {
			throw new Error("busy");
		});
		await service.addSessionToMemory(makeSession());
		expect(console.warn).toHaveBeenCalled();
	});
});

describe("_mergeEventLists fourth leftover matrices", () => {
	it("empty input yields empty", () => {
		expect(_mergeEventLists([])).toEqual([]);
	});

	it("single list unchanged", () => {
		const only = [event("a", 1, "one")];
		expect(_mergeEventLists([only])).toEqual([only]);
	});

	it("non-overlapping stay separate", () => {
		const left = [event("a", 1, "a")];
		const right = [event("b", 10, "b")];
		expect(_mergeEventLists([left, right])).toEqual([left, right]);
	});

	it("overlapping merges and drops duplicate timestamps", () => {
		const first = [event("a", 1, "a"), event("b", 5, "b")];
		const second = [event("c", 5, "c-dup"), event("d", 9, "d")];
		const merged = _mergeEventLists([first, second]);
		expect(merged).toHaveLength(1);
		expect(merged[0].map((e) => e.timestamp).sort((a, b) => a - b)).toEqual([
			1, 5, 9,
		]);
		expect(merged[0].find((e) => e.timestamp === 5)?.author).toBe("b");
	});

	it("consumes input array via shift", () => {
		const input: Event[][] = [[event("a", 1, "a")], [event("b", 2, "b")]];
		_mergeEventLists(input);
		expect(input).toHaveLength(0);
	});
});
