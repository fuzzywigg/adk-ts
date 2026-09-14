import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

function makeSession(text: string, overrides: Partial<Session> = {}): Session {
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
		...overrides,
	};
}

/**
 * Seventh leftover: event words use /[A-Za-z]+/g so accented/CJK/emoji drop,
 * while query.split keeps the full Unicode token.
 */
describe("in-memory memory unicode letter extract seventh leftover", () => {
	it("event 'café' extracts only 'caf'; query 'caf' hits, 'café' misses", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("café latte"));
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "caf",
				})
			).memories,
		).toHaveLength(1);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "café",
				})
			).memories,
		).toEqual([]);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "latte",
				})
			).memories,
		).toHaveLength(1);
	});

	it("CJK-only event yields zero letter words and is skipped", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("北京欢迎你"));
		await expect(
			service.searchMemory({
				appName: "app",
				userId: "user",
				query: "北京",
			}),
		).resolves.toEqual({ memories: [] });
	});

	it("emoji-only event is skipped; mixed emoji+ascii still matches ascii", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory({
			appName: "app",
			userId: "user",
			id: "s1",
			state: {},
			events: [
				{
					author: "emoji",
					timestamp: 1,
					content: { parts: [{ text: "😀🎉" }] },
				} as any,
				{
					author: "mixed",
					timestamp: 2,
					content: { parts: [{ text: "😀 hello" }] },
				} as any,
			],
			lastUpdateTime: 1,
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "hello",
		});
		expect(result.memories.map((m) => m.author)).toEqual(["mixed"]);
	});

	it("German ß / umlaut event extracts ascii islands only", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("Straße"));
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "stra",
				})
			).memories,
		).toHaveLength(1);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "straße",
				})
			).memories,
		).toEqual([]);
	});

	it("query NFC café token never equals extracted 'caf' even when event is ascii cafe", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("cafe"));
		await expect(
			service.searchMemory({
				appName: "app",
				userId: "user",
				query: "café",
			}),
		).resolves.toEqual({ memories: [] });
	});
});
