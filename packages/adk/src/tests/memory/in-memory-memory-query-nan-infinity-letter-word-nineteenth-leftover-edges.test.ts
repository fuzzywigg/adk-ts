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
 * Nineteenth leftover: `_extractWordsLower` `/[A-Za-z]+/g` — eighteenth pins
 * `"null"` / `"undefined"` letter-words; seventeenth pins `"true"`. Query /
 * event `"NaN"` and `"Infinity"` also extract letter-words and match
 * (distinct tokens from null/true/false).
 */
describe("in-memory memory query NaN-Infinity letter-word nineteenth leftover", () => {
	it('query "NaN" hits event text "NaN"', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("NaN"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "NaN",
		});
		expect(result.memories).toHaveLength(1);
	});

	it('query "nan" hits event text "NaN" (case fold)', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("NaN"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "nan",
		});
		expect(result.memories).toHaveLength(1);
	});

	it('query "Infinity" hits event text "Infinity"', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("Infinity"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "Infinity",
		});
		expect(result.memories).toHaveLength(1);
	});

	it('query "NaN" misses event text "null"', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("null"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "NaN",
		});
		expect(result.memories).toEqual([]);
	});

	it('query "null" still hits event "null" (eighteenth control)', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("null"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "null",
		});
		expect(result.memories).toHaveLength(1);
	});
});
