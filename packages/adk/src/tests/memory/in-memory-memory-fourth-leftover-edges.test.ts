import { describe, expect, it, vi } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
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
				timestamp: Date.parse("2024-06-01T00:00:00.000Z"),
				content: {
					parts: [{ text: "Alpha beta gamma delta" }],
				},
			} as any,
			{
				author: "agent",
				timestamp: Date.parse("2024-06-01T00:01:00.000Z"),
				content: {
					parts: [{ text: "Epsilon zeta" }],
				},
			} as any,
		],
		lastUpdateTime: Date.now() / 1000,
		...overrides,
	};
}

describe("InMemoryMemoryService fourth leftover matrices", () => {
	const queryHits: Array<{ query: string; expectedAuthors: string[] }> = [
		{ query: "alpha", expectedAuthors: ["user"] },
		{ query: "ALPHA", expectedAuthors: ["user"] },
		{ query: "zeta", expectedAuthors: ["agent"] },
		{ query: "missingword", expectedAuthors: [] },
		{ query: "alpha zeta", expectedAuthors: ["user", "agent"] },
		{ query: "gamma", expectedAuthors: ["user"] },
		{ query: "", expectedAuthors: [] },
		{ query: "   ", expectedAuthors: [] },
	];

	for (const { query, expectedAuthors } of queryHits) {
		it(`searchMemory query ${JSON.stringify(query)}`, async () => {
			const service = new InMemoryMemoryService();
			await service.addSessionToMemory(makeSession());
			const result = await service.searchMemory({
				appName: "app",
				userId: "user",
				query,
			});
			expect(result.memories.map((m) => m.author)).toEqual(expectedAuthors);
		});
	}

	it("returns empty for unknown app/user keys", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());
		expect(
			(
				await service.searchMemory({
					appName: "other",
					userId: "user",
					query: "alpha",
				})
			).memories,
		).toEqual([]);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "other",
					query: "alpha",
				})
			).memories,
		).toEqual([]);
	});

	it("addSessionToMemory filters events without content.parts", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{ author: "skip" } as any,
					{ author: "skip2", content: {} } as any,
					{
						author: "keep",
						timestamp: 1,
						content: { parts: [{ text: "keyword zebra" }] },
					} as any,
				],
			}),
		);
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "zebra",
		});
		expect(result.memories.map((m) => m.author)).toEqual(["keep"]);
	});

	it("replaces prior session events on re-add for same session id", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				id: "s1",
				events: [
					{
						author: "old",
						timestamp: 1,
						content: { parts: [{ text: "oldword" }] },
					} as any,
				],
			}),
		);
		await service.addSessionToMemory(
			makeSession({
				id: "s1",
				events: [
					{
						author: "new",
						timestamp: 2,
						content: { parts: [{ text: "newword" }] },
					} as any,
				],
			}),
		);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "oldword",
				})
			).memories,
		).toEqual([]);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "newword",
				})
			).memories[0].author,
		).toBe("new");
	});

	it("searches across multiple sessions under same user key", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				id: "s1",
				events: [
					{
						author: "a",
						timestamp: 1,
						content: { parts: [{ text: "shared token" }] },
					} as any,
				],
			}),
		);
		await service.addSessionToMemory(
			makeSession({
				id: "s2",
				events: [
					{
						author: "b",
						timestamp: 2,
						content: { parts: [{ text: "shared token" }] },
					} as any,
				],
			}),
		);
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "shared",
		});
		expect(result.memories.map((m) => m.author).sort()).toEqual(["a", "b"]);
	});

	it("isolates sessions by appName/userId key", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				appName: "appA",
				userId: "u1",
				events: [
					{
						author: "x",
						timestamp: 1,
						content: { parts: [{ text: "secret word" }] },
					} as any,
				],
			}),
		);
		expect(
			(
				await service.searchMemory({
					appName: "appA",
					userId: "u2",
					query: "secret",
				})
			).memories,
		).toEqual([]);
		expect(
			(
				await service.searchMemory({
					appName: "appB",
					userId: "u1",
					query: "secret",
				})
			).memories,
		).toEqual([]);
		expect(
			(
				await service.searchMemory({
					appName: "appA",
					userId: "u1",
					query: "secret",
				})
			).memories,
		).toHaveLength(1);
	});

	it("matches any query word via OR semantics", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "hit",
						timestamp: 1,
						content: { parts: [{ text: "only banana here" }] },
					} as any,
				],
			}),
		);
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "apple banana cherry",
		});
		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].author).toBe("hit");
	});

	it("ignores non-letter tokens in event text for matching", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "nums",
						timestamp: 1,
						content: { parts: [{ text: "order 12345 code" }] },
					} as any,
				],
			}),
		);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "12345",
				})
			).memories,
		).toEqual([]);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "order",
				})
			).memories,
		).toHaveLength(1);
	});

	it("joins multi-part text before keyword extraction", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "multi",
						timestamp: 1,
						content: {
							parts: [{ text: "hello" }, { text: "worldly" }],
						},
					} as any,
				],
			}),
		);
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "worldly",
		});
		expect(result.memories[0].author).toBe("multi");
	});

	it("skips events whose parts have no extractable words", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "blank",
						timestamp: 1,
						content: { parts: [{ text: "!!!" }, { text: "123" }] },
					} as any,
					{
						author: "hit",
						timestamp: 2,
						content: { parts: [{ text: "realword" }] },
					} as any,
				],
			}),
		);
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "realword",
		});
		expect(result.memories.map((m) => m.author)).toEqual(["hit"]);
	});

	it("clear empties all stored sessions", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());
		service.clear();
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "alpha",
				})
			).memories,
		).toEqual([]);
	});

	it("deprecated getAllSessions returns empty and warns", () => {
		const service = new InMemoryMemoryService();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(service.getAllSessions()).toEqual([]);
		expect(warn).toHaveBeenCalled();
	});

	it("deprecated getSession returns undefined and warns", () => {
		const service = new InMemoryMemoryService();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(service.getSession("any")).toBeUndefined();
		expect(warn).toHaveBeenCalled();
	});

	it("memory entries include author content and timestamp string", async () => {
		const service = new InMemoryMemoryService();
		const ts = Date.parse("2024-06-01T12:00:00.000Z");
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "stamp",
						timestamp: ts,
						content: { parts: [{ text: "timestamped word" }] },
					} as any,
				],
			}),
		);
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "timestamped",
		});
		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].author).toBe("stamp");
		expect(result.memories[0].content).toEqual({
			parts: [{ text: "timestamped word" }],
		});
		expect(typeof result.memories[0].timestamp).toBe("string");
		expect(result.memories[0].timestamp!.length).toBeGreaterThan(0);
	});

	it("inject edge: skips events without parts then matches", async () => {
		const service = new InMemoryMemoryService();
		(service as any)._sessionEvents.set(
			"app/user",
			new Map([
				[
					"s1",
					[
						{ author: "a" },
						{ author: "b", content: undefined },
						{ author: "c", content: { parts: null } },
						{
							author: "d",
							content: { parts: [{ text: "findable keyword quirky" }] },
						},
					],
				],
			]),
		);
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "quirky",
		});
		expect(result.memories.map((m) => m.author)).toEqual(["d"]);
	});

	it("case-insensitive word matching extracts letters only", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "mix",
						timestamp: 1,
						content: { parts: [{ text: "Hello, World!" }] },
					} as any,
				],
			}),
		);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "hello",
				})
			).memories,
		).toHaveLength(1);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "world",
				})
			).memories,
		).toHaveLength(1);
	});
});
