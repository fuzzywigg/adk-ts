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
 * Sixteenth leftover: `_extractWordsLower` uses `/[A-Za-z]+/g` —
 * thirteenth/fifth cover digit-only skip and alphanum asymmetry. Event/
 * query `"false"` extracts letter-word `false` and matches; `"0"` never
 * extracts as a word (digit-only).
 */
describe("in-memory memory query false-letter vs zero-digit sixteenth leftover", () => {
	it('query "false" hits event text "false"', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("false"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "false",
		});
		expect(result.memories).toHaveLength(1);
	});

	it('query "0" misses event text "0" (digits not extracted)', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("0"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "0",
		});
		expect(result.memories).toEqual([]);
	});

	it('query "false" misses event text "0"', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("0"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "false",
		});
		expect(result.memories).toEqual([]);
	});

	it('query "0" misses event text "false"', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("false"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "0",
		});
		expect(result.memories).toEqual([]);
	});
});
