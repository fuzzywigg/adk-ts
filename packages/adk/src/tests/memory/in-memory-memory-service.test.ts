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
});
