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
 * Eighteenth leftover (HEAVY tip-relaunch residual after #242):
 * `_extractWordsLower` `/[A-Za-z]+/g` — eighteenth pins `"null"` / `"undefined"`;
 * seventeenth pins `"true"`. Query/event `"nan"` and `"infinity"` also extract
 * letter-words and match (case-insensitive; distinct from digit-only skip).
 */
describe("in-memory memory query nan/infinity letter-word eighteenth leftover", () => {
	it('query "nan" hits event text "nan"', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("nan"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "nan",
		});
		expect(result.memories).toHaveLength(1);
	});

	it('query "infinity" hits event text "Infinity" (case fold)', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("Infinity"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "infinity",
		});
		expect(result.memories).toHaveLength(1);
	});

	it('query "nan" misses event text "null"', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("null"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "nan",
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
