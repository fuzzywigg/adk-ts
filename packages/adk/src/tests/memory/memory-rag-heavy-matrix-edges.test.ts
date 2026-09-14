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
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import {
	_mergeEventLists,
	VertexAiRagMemoryService,
} from "../../memory/vertex-ai-rag-memory-service";
import type { Session } from "../../sessions/session";

function makeSession(overrides?: Partial<Session>): Session {
	return {
		appName: "app",
		userId: "user",
		id: "session-1",
		state: {},
		events: [
			{
				author: "user",
				timestamp: Date.parse("2024-01-01T00:00:00.000Z"),
				content: {
					parts: [{ text: "The weather in Paris is sunny today" }],
				},
			} as any,
			{
				author: "agent",
				timestamp: Date.parse("2024-01-01T00:01:00.000Z"),
				content: {
					parts: [{ text: "Noted." }],
				},
			} as any,
		],
		lastUpdateTime: Date.now() / 1000,
		...overrides,
	};
}

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

describe("InMemoryMemoryService heavy matrix", () => {
	it.each([
		["paris weather", 1],
		["sunny", 1],
		["tokyo", 0],
		["PARIS", 1],
	])("searchMemory query %j yields %s hits", async (query, count) => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());
		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query,
		});
		expect(hits.memories).toHaveLength(count);
	});

	it("returns empty for unknown user", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "other",
					query: "paris",
				})
			).memories,
		).toEqual([]);
	});

	it("keeps sessions isolated by app and user keys", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());
		await service.addSessionToMemory(
			makeSession({
				appName: "other-app",
				id: "session-2",
				events: [
					{
						author: "user",
						timestamp: Date.parse("2024-02-01T00:00:00.000Z"),
						content: { parts: [{ text: "The weather in Paris is rainy" }] },
					} as any,
				],
			}),
		);
		const appHits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "paris",
		});
		const otherHits = await service.searchMemory({
			appName: "other-app",
			userId: "user",
			query: "paris",
		});
		expect(appHits.memories[0].content?.parts?.[0]?.text).toContain("sunny");
		expect(otherHits.memories[0].content?.parts?.[0]?.text).toContain("rainy");
	});

	it("replaces prior memory for the same session id", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: Date.parse("2024-03-01T00:00:00.000Z"),
						content: {
							parts: [{ text: "Updated Paris forecast is cloudy" }],
						},
					} as any,
				],
			}),
		);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "cloudy",
				})
			).memories,
		).toHaveLength(1);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "sunny",
				})
			).memories,
		).toEqual([]);
	});

	it("searches across multiple sessions for the same user", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());
		await service.addSessionToMemory(
			makeSession({
				id: "session-2",
				events: [
					{
						author: "user",
						timestamp: Date.parse("2024-04-01T00:00:00.000Z"),
						content: { parts: [{ text: "Berlin has mild weather today" }] },
					} as any,
				],
			}),
		);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "berlin",
				})
			).memories,
		).toHaveLength(1);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "paris",
				})
			).memories,
		).toHaveLength(1);
	});

	it("clears stored memories", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());
		service.clear();
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "paris",
				})
			).memories,
		).toEqual([]);
	});

	it("skips empty-text events and matches case-insensitively", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: Date.parse("2024-05-01T00:00:00.000Z"),
						content: { parts: [{ text: "" }] },
					} as any,
					{
						author: "user",
						timestamp: Date.parse("2024-05-01T00:01:00.000Z"),
						content: { parts: [{ text: "Hello, PARIS!!!" }] },
					} as any,
				],
			}),
		);
		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "paris",
		});
		expect(hits.memories).toHaveLength(1);
	});

	it("formats Date and ISO string timestamps", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: new Date("2024-06-01T12:00:00.000Z") as any,
						content: { parts: [{ text: "London fog" }] },
					} as any,
					{
						author: "user",
						timestamp: "2024-06-02T12:00:00.000Z" as any,
						content: { parts: [{ text: "London rain" }] },
					} as any,
				],
			}),
		);
		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "london",
		});
		expect(hits.memories.map((m) => m.timestamp).sort()).toEqual([
			"2024-06-01T12:00:00.000Z",
			"2024-06-02T12:00:00.000Z",
		]);
	});

	it("joins multi-part text when matching keywords", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: Date.parse("2024-07-01T00:00:00.000Z"),
						content: {
							parts: [
								{ text: "Visit " },
								{ text: "Madrid" },
								{ text: " soon" },
							],
						},
					} as any,
				],
			}),
		);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "madrid",
				})
			).memories,
		).toHaveLength(1);
	});

	it("filters events without content.parts on add", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{ author: "user" } as any,
					{
						author: "user",
						timestamp: Date.parse("2024-08-01T00:00:00.000Z"),
						content: { parts: [{ text: "keep London rain" }] },
					} as any,
				],
			}),
		);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "london",
				})
			).memories,
		).toHaveLength(1);
	});
});

describe("_mergeEventLists heavy matrix", () => {
	it("returns empty for empty input", () => {
		expect(_mergeEventLists([])).toEqual([]);
	});

	it("returns a single list unchanged", () => {
		const only = [event("a", 1, "one"), event("b", 2, "two")];
		expect(_mergeEventLists([only])).toEqual([only]);
	});

	it("keeps non-overlapping timestamp lists separate", () => {
		const left = [event("a", 1, "a"), event("b", 2, "b")];
		const right = [event("c", 10, "c"), event("d", 11, "d")];
		expect(_mergeEventLists([left, right])).toEqual([left, right]);
	});

	it("merges lists that share a timestamp", () => {
		const first = [event("a", 1, "a"), event("b", 5, "b")];
		const second = [event("c", 5, "c-dup"), event("d", 9, "d")];
		const merged = _mergeEventLists([first, second]);
		expect(merged).toHaveLength(1);
		expect(merged[0].map((e) => e.timestamp).sort((a, b) => a - b)).toEqual([
			1, 5, 9,
		]);
	});

	it("transitively merges overlapping chains", () => {
		const a = [event("a", 1, "a"), event("ab", 2, "ab")];
		const b = [event("b", 2, "b"), event("bc", 3, "bc")];
		const c = [event("c", 3, "c"), event("d", 4, "d")];
		const merged = _mergeEventLists([a, b, c]);
		expect(merged).toHaveLength(1);
		expect(merged[0].map((e) => e.timestamp).sort((a, b) => a - b)).toEqual([
			1, 2, 3, 4,
		]);
	});

	it("consumes the input array as lists are shifted", () => {
		const input: Event[][] = [[event("a", 1, "a")], [event("b", 2, "b")]];
		_mergeEventLists(input);
		expect(input).toHaveLength(0);
	});
});

describe("VertexAiRagMemoryService heavy matrix", () => {
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
		expect(new VertexAiRagMemoryService()).toBeInstanceOf(
			VertexAiRagMemoryService,
		);
		expect(
			new VertexAiRagMemoryService(
				"projects/p/locations/l/ragCorpora/c1",
				5,
				0.4,
			),
		).toBeInstanceOf(VertexAiRagMemoryService);
	});

	it("addSessionToMemory throws when no rag resources configured", async () => {
		const service = new VertexAiRagMemoryService();
		await expect(service.addSessionToMemory(makeSession())).rejects.toThrow(
			/Rag resources must be set/,
		);
	});

	it("uploads temp content and skips non-text events", async () => {
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

	it("searchMemory returns empty memories from mock retrieval", async () => {
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
			}),
		);
	});

	it("warns when temp file cleanup fails", async () => {
		unlinkSync.mockImplementation(() => {
			throw new Error("ENOENT");
		});
		const service = new VertexAiRagMemoryService("corpus-cleanup");
		await expect(
			service.addSessionToMemory(
				makeSession({
					appName: "demo",
					userId: "alice",
					id: "sess-cleanup",
					events: [
						{
							author: "user",
							timestamp: 1,
							content: { parts: [{ text: "persist me" }] },
						} as Event,
					],
				}),
			),
		).resolves.toBeUndefined();
		expect(console.warn).toHaveBeenCalledWith(
			"Failed to delete temporary file:",
			expect.any(String),
			expect.any(Error),
		);
	});

	it.each([
		"q1",
		"find paris",
		"empty",
	])("searchMemory logs retrieval for query %j", async (query) => {
		const service = new VertexAiRagMemoryService("corpus-q");
		await service.searchMemory({
			appName: "demo",
			userId: "u",
			query,
		});
		expect(console.log).toHaveBeenCalledWith(
			"Mock retrieval_query:",
			expect.objectContaining({ text: query }),
		);
	});

	it("addSessionToMemory joins multi-part text with periods", async () => {
		const service = new VertexAiRagMemoryService("corpus-join");
		await service.addSessionToMemory(
			makeSession({
				appName: "demo",
				userId: "u",
				id: "s-join",
				events: [
					{
						author: "user",
						timestamp: 9,
						content: { parts: [{ text: "alpha" }, { text: "beta" }] },
					} as Event,
				],
			}),
		);
		expect(writeFileSync).toHaveBeenCalledWith(
			expect.any(String),
			jsonLine("user", 9, "alpha.beta"),
			"utf8",
		);
	});

	it("addSessionToMemory with only non-text events still uploads empty-ish file", async () => {
		const service = new VertexAiRagMemoryService("corpus-empty");
		await service.addSessionToMemory(
			makeSession({
				appName: "demo",
				userId: "u",
				id: "s-empty",
				events: [{ author: "system", timestamp: 1 } as Event],
			}),
		);
		expect(writeFileSync).toHaveBeenCalled();
		expect(console.log).toHaveBeenCalledWith(
			"Mock upload_file:",
			expect.objectContaining({ display_name: "demo.u.s-empty" }),
		);
	});
});
