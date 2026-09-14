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

	it("indexes empty parts arrays but yields no keyword matches from them", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: 1,
						content: { parts: [] },
					} as any,
					{
						author: "user",
						timestamp: 2,
						content: { parts: [{ text: "Alive Rome marble" }] },
					} as any,
				],
			}),
		);

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "rome",
		});
		expect(hits.memories).toHaveLength(1);
		expect(hits.memories[0].content?.parts?.[0]?.text).toContain("Rome");
	});

	it("filters events whose content.parts is null at index time", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: 1,
						content: { parts: null },
					} as any,
					{
						author: "user",
						timestamp: 2,
						content: { parts: [{ text: "Keep Vienna quiet" }] },
					} as any,
				],
			}),
		);

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "vienna",
		});
		expect(hits.memories).toHaveLength(1);
	});

	it("does not match query tokens that retain punctuation", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());

		const punctuated = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "paris,",
		});
		expect(punctuated.memories).toEqual([]);

		const clean = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "paris",
		});
		expect(clean.memories).toHaveLength(1);
	});

	it("requires full word equality rather than substring matches", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());

		const partial = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "pari",
		});
		expect(partial.memories).toEqual([]);

		const longer = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "pariss",
		});
		expect(longer.memories).toEqual([]);
	});

	it("skips digit-only and symbol-heavy text that yields no letter words", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: 1,
						content: { parts: [{ text: "42 007 3.14" }] },
					} as any,
					{
						author: "user",
						timestamp: 2,
						content: { parts: [{ text: "$$$ ### @@@" }] },
					} as any,
					{
						author: "user",
						timestamp: 3,
						content: { parts: [{ text: "Cairo nights" }] },
					} as any,
				],
			}),
		);

		const digits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "42",
		});
		expect(digits.memories).toEqual([]);

		const cairo = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "cairo",
		});
		expect(cairo.memories).toHaveLength(1);
	});

	it("extracts letter runs across hyphens and underscores as separate words", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: 1,
						content: {
							parts: [{ text: "well-known foo_bar cityscape" }],
						},
					} as any,
				],
			}),
		);

		const well = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "well",
		});
		const known = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "known",
		});
		const foo = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "foo",
		});
		const bar = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "bar",
		});
		const joined = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "well-known",
		});

		expect(well.memories).toHaveLength(1);
		expect(known.memories).toHaveLength(1);
		expect(foo.memories).toHaveLength(1);
		expect(bar.memories).toHaveLength(1);
		expect(joined.memories).toEqual([]);
	});

	it("stores empty-event sessions under the user key without searchable text", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession({ events: [] }));

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "paris",
		});
		expect(hits.memories).toEqual([]);
	});

	it("formats numeric epoch timestamps on matched memories", async () => {
		const service = new InMemoryMemoryService();
		const ms = Date.parse("2024-09-01T08:30:00.000Z");
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "historian",
						timestamp: ms,
						content: { parts: [{ text: "Lisbon archive note" }] },
					} as any,
				],
			}),
		);

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "lisbon",
		});
		expect(hits.memories).toHaveLength(1);
		expect(hits.memories[0].author).toBe("historian");
		expect(hits.memories[0].timestamp).toBe("2024-09-01T08:30:00.000Z");
	});

	it("ignores empty query tokens created by consecutive spaces", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "paris   sunny",
		});
		expect(hits.memories).toHaveLength(1);
	});

	it("does not match author or metadata — only event text words", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "specialAuthor",
						timestamp: 1,
						content: { parts: [{ text: "Only about rivers" }] },
					} as any,
				],
			}),
		);

		const byAuthor = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "specialauthor",
		});
		expect(byAuthor.memories).toEqual([]);

		const byText = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "rivers",
		});
		expect(byText.memories).toHaveLength(1);
		expect(byText.memories[0].author).toBe("specialAuthor");
	});

	it("deprecated getters still warn and stay empty after sessions are indexed", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		expect(service.getAllSessions()).toEqual([]);
		expect(service.getSession("session-1")).toBeUndefined();
		expect(warn).toHaveBeenCalledTimes(2);

		warn.mockRestore();
	});

	it("skips parts with falsy text while still matching sibling text parts", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: 1,
						content: {
							parts: [
								{ text: "" },
								{ text: undefined },
								{ text: "Helsinki snow" },
							],
						},
					} as any,
				],
			}),
		);

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "helsinki",
		});
		expect(hits.memories).toHaveLength(1);
	});

	it("returns empty when searching an unknown app even if userId collides", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());

		const hits = await service.searchMemory({
			appName: "missing-app",
			userId: "user",
			query: "paris",
		});
		expect(hits.memories).toEqual([]);
	});

	it("preserves encounter order of matching events across sessions", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				id: "s-a",
				events: [
					{
						author: "a",
						timestamp: 1,
						content: { parts: [{ text: "Alpha mention of Zurich" }] },
					} as any,
				],
			}),
		);
		await service.addSessionToMemory(
			makeSession({
				id: "s-b",
				events: [
					{
						author: "b",
						timestamp: 2,
						content: { parts: [{ text: "Beta mention of Zurich" }] },
					} as any,
				],
			}),
		);

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "zurich",
		});
		expect(hits.memories.map((m) => m.author)).toEqual(["a", "b"]);
	});

	it("searchMemory continues past events lacking content/parts when map is mutated", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession({ events: [] }));
		const userKey = "app/user";
		(service as any)._sessionEvents.get(userKey).set("session-1", [
			{ author: "user", timestamp: 1 },
			{ author: "user", timestamp: 2, content: {} },
			{
				author: "user",
				timestamp: 3,
				content: { parts: [{ text: "Keep Lisbon warm" }] },
			},
		]);

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "lisbon",
		});
		expect(hits.memories).toHaveLength(1);
		expect(hits.memories[0].content?.parts?.[0]?.text).toContain("Lisbon");
	});
});
