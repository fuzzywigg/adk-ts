import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

/**
 * Eighteenth leftover: query matching uses `query.toLowerCase().split(" ")`
 * then Set membership against letter-only extracted words. Seventeenth pins
 * query `"true"` letter match. Digit-only `"1"` never enters letter words;
 * mixed `"true 1"` matches on the letter token only.
 */
describe("in-memory memory query digit-one vs letter-true eighteenth leftover", () => {
	async function seedWithText(text: string): Promise<InMemoryMemoryService> {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory({
			appName: "app",
			userId: "user",
			id: "s1",
			state: {},
			events: [
				{
					author: "user",
					timestamp: 1,
					content: { parts: [{ text }] },
				} as any,
			],
			lastUpdateTime: 1,
		} as Session);
		return service;
	}

	it('query "1" does not match digit text (letters-only extract)', async () => {
		const service = await seedWithText("room 1 available");
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "1",
		});
		expect(result.memories).toHaveLength(0);
	});

	it('query "true 1" matches on letter token true only', async () => {
		const service = await seedWithText("the true answer is 1");
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "true 1",
		});
		expect(result.memories).toHaveLength(1);
	});

	it('query "true" still matches (seventeenth control)', async () => {
		const service = await seedWithText("true north");
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "true",
		});
		expect(result.memories).toHaveLength(1);
	});
});
