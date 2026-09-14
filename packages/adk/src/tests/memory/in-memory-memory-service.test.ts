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
			{
				author: "system",
				timestamp: Date.now(),
			} as any,
		],
		lastUpdateTime: Date.now() / 1000,
		...overrides,
	};
}

describe("InMemoryMemoryService", () => {
	it("indexes session events and finds keyword matches", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "paris weather",
		});

		expect(hits.memories).toHaveLength(1);
		expect(hits.memories[0].author).toBe("user");
		expect(hits.memories[0].content?.parts?.[0]?.text).toContain("Paris");
		expect(hits.memories[0].timestamp).toBe("2024-01-01T00:00:00.000Z");
	});

	it("returns empty results for unknown users or non-matching queries", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());

		const unknownUser = await service.searchMemory({
			appName: "app",
			userId: "other",
			query: "paris",
		});
		expect(unknownUser.memories).toEqual([]);

		const noMatch = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "tokyo",
		});
		expect(noMatch.memories).toEqual([]);
	});

	it("clears stored memories", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());
		service.clear();

		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "paris",
		});
		expect(result.memories).toEqual([]);
	});

	it("keeps sessions isolated by app and user keys", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());
		await service.addSessionToMemory(
			makeSession({
				appName: "other-app",
				userId: "user",
				id: "session-2",
				events: [
					{
						author: "user",
						timestamp: Date.parse("2024-02-01T00:00:00.000Z"),
						content: {
							parts: [{ text: "The weather in Paris is rainy" }],
						},
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

		expect(appHits.memories).toHaveLength(1);
		expect(appHits.memories[0].content?.parts?.[0]?.text).toContain("sunny");
		expect(otherHits.memories).toHaveLength(1);
		expect(otherHits.memories[0].content?.parts?.[0]?.text).toContain("rainy");
	});

	it("replaces prior memory for the same session id on re-add", async () => {
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

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "paris cloudy",
		});
		expect(hits.memories).toHaveLength(1);
		expect(hits.memories[0].content?.parts?.[0]?.text).toContain("cloudy");

		const oldHits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "sunny",
		});
		expect(oldHits.memories).toEqual([]);
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
						content: {
							parts: [{ text: "Berlin has mild weather today" }],
						},
					} as any,
				],
			}),
		);

		const paris = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "paris",
		});
		const berlin = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "berlin",
		});
		expect(paris.memories).toHaveLength(1);
		expect(berlin.memories).toHaveLength(1);
	});

	it("skips empty-text events and matches queries case-insensitively", async () => {
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
						content: {
							parts: [{ text: "Hello, PARIS!!!" }],
						},
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
		expect(hits.memories[0].content?.parts?.[0]?.text).toContain("PARIS");
	});

	it("formats Date and ISO string timestamps on stored memories", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: new Date("2024-06-01T12:00:00.000Z") as any,
						content: { parts: [{ text: "Date stamp for London fog" }] },
					} as any,
					{
						author: "user",
						timestamp: "2024-06-02T12:00:00.000Z" as any,
						content: { parts: [{ text: "ISO stamp for London rain" }] },
					} as any,
				],
			}),
		);

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "london",
		});
		expect(hits.memories).toHaveLength(2);
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
								{ text: "The capital of" },
								{ inlineData: { data: "x" } },
								{ text: "France is Paris" },
							],
						},
					} as any,
				],
			}),
		);

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "paris france",
		});
		expect(hits.memories).toHaveLength(1);
		expect(hits.memories[0].content?.parts).toHaveLength(3);
	});

	it("skips punctuation-only and non-text parts during search", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: 1,
						content: { parts: [{ text: "!!! ??? ---" }] },
					} as any,
					{
						author: "user",
						timestamp: 2,
						content: {
							parts: [{ functionCall: { name: "x", args: {} } }],
						},
					} as any,
					{
						author: "user",
						timestamp: 3,
						content: { parts: [{ text: "Madrid is warm" }] },
					} as any,
				],
			}),
		);

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "madrid",
		});
		expect(hits.memories).toHaveLength(1);
		expect(hits.memories[0].content?.parts?.[0]?.text).toContain("Madrid");
	});

	it("does not match on empty or whitespace-only query tokens", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());

		const blank = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "   ",
		});
		expect(blank.memories).toEqual([]);
	});

	it("filters out events without content.parts when indexing", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{ author: "user", timestamp: 1 } as any,
					{
						author: "user",
						timestamp: 2,
						content: {},
					} as any,
					{
						author: "user",
						timestamp: 3,
						content: { parts: [{ text: "Keep Oslo cold" }] },
					} as any,
				],
			}),
		);

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "oslo",
		});
		expect(hits.memories).toHaveLength(1);
	});

	it("matches any single query token against event words", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "tokyo sunny nowhere",
		});
		expect(hits.memories).toHaveLength(1);
		expect(hits.memories[0].content?.parts?.[0]?.text).toContain("sunny");
	});

	it("warns and returns empty from deprecated getAllSessions/getSession", () => {
		const service = new InMemoryMemoryService();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		expect(service.getAllSessions()).toEqual([]);
		expect(service.getSession("any")).toBeUndefined();
		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn.mock.calls[0][0]).toMatch(/getAllSessions\(\) is deprecated/);
		expect(warn.mock.calls[1][0]).toMatch(/getSession\(\) is deprecated/);

		warn.mockRestore();
	});

	it("isolates users under the same app name", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession({ userId: "alice" }));
		await service.addSessionToMemory(
			makeSession({
				userId: "bob",
				id: "session-bob",
				events: [
					{
						author: "user",
						timestamp: 1,
						content: { parts: [{ text: "Bob likes Tokyo noodles" }] },
					} as any,
				],
			}),
		);

		const alice = await service.searchMemory({
			appName: "app",
			userId: "alice",
			query: "paris",
		});
		const bob = await service.searchMemory({
			appName: "app",
			userId: "bob",
			query: "tokyo",
		});
		expect(alice.memories).toHaveLength(1);
		expect(bob.memories).toHaveLength(1);
		expect(bob.memories[0].content?.parts?.[0]?.text).toContain("Tokyo");

		const aliceTokyo = await service.searchMemory({
			appName: "app",
			userId: "alice",
			query: "tokyo",
		});
		expect(aliceTokyo.memories).toEqual([]);
	});

	it("returns multiple matching events from one session", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: Date.parse("2024-08-01T00:00:00.000Z"),
						content: { parts: [{ text: "Cats are playful" }] },
					} as any,
					{
						author: "agent",
						timestamp: Date.parse("2024-08-01T00:01:00.000Z"),
						content: { parts: [{ text: "Dogs are loyal" }] },
					} as any,
					{
						author: "user",
						timestamp: Date.parse("2024-08-01T00:02:00.000Z"),
						content: { parts: [{ text: "Cats and dogs coexist" }] },
					} as any,
				],
			}),
		);

		const cats = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "cats",
		});
		expect(cats.memories).toHaveLength(2);
		expect(cats.memories.map((m) => m.author)).toEqual(["user", "user"]);
	});

	it("clear is idempotent and search stays empty afterward", async () => {
		const service = new InMemoryMemoryService();
		service.clear();
		service.clear();
		expect(
			await service.searchMemory({
				appName: "app",
				userId: "user",
				query: "anything",
			}),
		).toEqual({ memories: [] });
	});

	it("search skips events missing content.parts after defensive mutation", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: Date.parse("2024-01-01T00:00:00.000Z"),
						content: { parts: [{ text: "Paris is lovely" }] },
					} as any,
				],
			}),
		);
		const sessions = (service as any)._sessionEvents as Map<
			string,
			Map<string, any[]>
		>;
		const events = sessions.get("app/user")!.get("session-1")!;
		events.push({
			author: "broken",
			timestamp: Date.now(),
			content: { role: "model" },
		});
		events.push({
			author: "missing",
			timestamp: Date.now(),
		});

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "paris",
		});
		expect(hits.memories).toHaveLength(1);
		expect(hits.memories[0].author).toBe("user");
	});

	it("query with only whitespace or empty tokens yields no matches", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());
		expect(
			await service.searchMemory({
				appName: "app",
				userId: "user",
				query: "   ",
			}),
		).toEqual({ memories: [] });
		expect(
			await service.searchMemory({
				appName: "app",
				userId: "user",
				query: "",
			}),
		).toEqual({ memories: [] });
	});

	it("indexes agent text and matches across multi-word queries with extra spaces", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "agent",
						timestamp: Date.parse("2024-03-01T00:00:00.000Z"),
						content: {
							parts: [{ text: "The capital of France is Paris" }],
						},
					} as any,
				],
			}),
		);
		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "  paris   france  ",
		});
		expect(hits.memories).toHaveLength(1);
		expect(hits.memories[0].author).toBe("agent");
	});

	it("addSessionToMemory overwrites prior events for the same session id", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: 1,
						content: { parts: [{ text: "old tokyo data" }] },
					} as any,
				],
			}),
		);
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: 2,
						content: { parts: [{ text: "new berlin data" }] },
					} as any,
				],
			}),
		);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "tokyo",
				})
			).memories,
		).toEqual([]);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "berlin",
				})
			).memories,
		).toHaveLength(1);
	});
});
