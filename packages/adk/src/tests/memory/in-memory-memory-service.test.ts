import { describe, expect, it } from "vitest";
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
});
