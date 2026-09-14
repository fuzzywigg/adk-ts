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
 * Eighteenth leftover: `_extractWordsLower` `/[A-Za-z]+/g` — seventeenth pins
 * `"true"` letter-word match; sixteenth pins `"false"`. Query/event `"null"`
 * also extracts letter-word `null` and matches (distinct token from true/false;
 * `"undefined"` likewise).
 */
describe("in-memory memory query null-letter-word eighteenth leftover", () => {
	it('query "null" hits event text "null"', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("null"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "null",
		});
		expect(result.memories).toHaveLength(1);
	});

	it('query "null" misses event text "true"', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("true"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "null",
		});
		expect(result.memories).toEqual([]);
	});

	it('query "undefined" hits event text "undefined"', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("undefined"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "undefined",
		});
		expect(result.memories).toHaveLength(1);
	});

	it('query "true" still hits event "true" (seventeenth control)', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("true"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "true",
		});
		expect(result.memories).toHaveLength(1);
	});
});
