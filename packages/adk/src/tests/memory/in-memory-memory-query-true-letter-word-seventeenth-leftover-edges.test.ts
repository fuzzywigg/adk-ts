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
 * Seventeenth leftover: `_extractWordsLower` `/[A-Za-z]+/g` — sixteenth pins
 * `"false"` letter-word match vs `"0"` digit miss. Query/event `"true"` also
 * extracts letter-word `true` and matches (distinct token from `"false"`).
 */
describe("in-memory memory query true-letter-word seventeenth leftover", () => {
	it('query "true" hits event text "true"', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("true"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "true",
		});
		expect(result.memories).toHaveLength(1);
	});

	it('query "true" misses event text "false"', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("false"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "true",
		});
		expect(result.memories).toEqual([]);
	});

	it('query "false" still hits event "false" (sixteenth control)', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("false"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "false",
		});
		expect(result.memories).toHaveLength(1);
	});
});
