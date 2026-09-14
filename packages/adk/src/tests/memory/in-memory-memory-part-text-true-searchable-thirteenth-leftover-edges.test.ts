import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

/**
 * Thirteenth leftover: truthy `part.text` filter keeps boolean `true`, which
 * joins as `"true"` and becomes a searchable letter word. Fifth leftover
 * covers falsy 0/false/""; sixth covers string `"0"`.
 */
describe("in-memory memory part.text true searchable thirteenth leftover", () => {
	it('boolean true part.text becomes searchable word "true"', async () => {
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
					content: { parts: [{ text: true as any }, { text: "x" }] },
				} as any,
			],
			lastUpdateTime: 1,
		} as Session);

		const hit = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "true",
		});
		expect(hit.memories).toHaveLength(1);

		const miss = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "false",
		});
		expect(miss.memories).toEqual([]);
	});

	it("falsy false part.text still filtered out (fifth control)", async () => {
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
					content: { parts: [{ text: false as any }, { text: "keep" }] },
				} as any,
			],
			lastUpdateTime: 1,
		} as Session);

		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "false",
		});
		expect(result.memories).toEqual([]);
		const keep = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "keep",
		});
		expect(keep.memories).toHaveLength(1);
	});
});
