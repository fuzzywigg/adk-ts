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
 * Twentieth leftover (HEAVY tip-relaunch residual after #258):
 * `_extractWordsLower` `/[A-Za-z]+/g` — nineteenth pins `"NaN"` / `"Infinity"`.
 * Event text `"-Infinity"` still extracts letter-word `infinity` (leading
 * hyphen stripped by the regex), so query `"Infinity"` hits; bare digits /
 * signs alone still miss.
 */
describe("in-memory memory query -Infinity letter-word twentieth leftover", () => {
	it('query "Infinity" hits event text "-Infinity" (letter extract)', async () => {
		expect("-Infinity".match(/[A-Za-z]+/g)).toEqual(["Infinity"]);
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("-Infinity"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "Infinity",
		});
		expect(result.memories).toHaveLength(1);
	});

	it('query "-Infinity" split token misses letter-word set', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("-Infinity"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "-Infinity",
		});
		// query.toLowerCase().split(" ") keeps "-infinity" as one token;
		// wordsInEvent has "infinity" only → no match
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
