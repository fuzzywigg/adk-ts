import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

function makeSession(text: string): Session {
	return {
		appName: "app",
		userId: "user",
		id: "session-1",
		state: {},
		events: [
			{
				author: "user",
				timestamp: Date.parse("2024-06-01T00:00:00.000Z"),
				content: { parts: [{ text }] },
			} as any,
		],
		lastUpdateTime: Date.now() / 1000,
	};
}

/**
 * Twentieth leftover: query uses `query.toLowerCase().split(" ")` while
 * events use `_extractWordsLower` `/[A-Za-z]+/g`. Nineteenth pins event /
 * query `"Infinity"` letter-word match. Query `"-Infinity"` keeps the
 * hyphenated token `"-infinity"` (no letter extract on the query side) so
 * it misses event `"Infinity"` / `"-Infinity"` (event extracts `"infinity"`)
 * — asymmetry vs query `"Infinity"` which still hits.
 */
describe("in-memory memory query -Infinity letter-word twentieth leftover", () => {
	it('query "Infinity" hits event text "-Infinity" (event letter-extract)', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("-Infinity"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "Infinity",
		});
		expect(result.memories).toHaveLength(1);
	});

	it('query "-Infinity" misses event text "-Infinity" (query keeps hyphen token)', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("-Infinity"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "-Infinity",
		});
		expect(result.memories).toEqual([]);
	});

	it('query "-Infinity" misses event text "Infinity"', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("Infinity"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "-Infinity",
		});
		expect(result.memories).toEqual([]);
	});

	it('query "-1" misses event text "-Infinity" (no letter tokens in "-1")', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("-Infinity"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "-1",
		});
		expect(result.memories).toEqual([]);
	});

	it('query "Infinity" still hits event "Infinity" (nineteenth control)', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("Infinity"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "Infinity",
		});
		expect(result.memories).toHaveLength(1);
	});
});
