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
 * Seventh leftover distinct from hyphen/underscore fifth: query tokens keep
 * trailing punctuation; event /[A-Za-z]+/g strips it. Apostrophes split events.
 */
describe("in-memory memory query punctuation token seventh leftover", () => {
	it("query 'hello!' misses event 'hello' because the bang stays on the token", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("hello world"));
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "hello!",
				})
			).memories,
		).toEqual([]);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "hello",
				})
			).memories,
		).toHaveLength(1);
	});

	it("event 'hello!' still extracts hello so a clean query hits", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("hello!"));
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "hello",
				})
			).memories,
		).toHaveLength(1);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "hello!",
				})
			).memories,
		).toEqual([]);
	});

	it("apostrophe splits event don't → don+t; query don't is a single miss", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("don't panic"));
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "don",
				})
			).memories,
		).toHaveLength(1);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "t",
				})
			).memories,
		).toHaveLength(1);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "don't",
				})
			).memories,
		).toEqual([]);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "panic",
				})
			).memories,
		).toHaveLength(1);
	});

	it.each([
		"hello?",
		"hello.",
		"hello,",
		"hello:",
		"hello;",
	])("query %j keeps punctuation and misses letter event", async (query) => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("hello there"));
		await expect(
			service.searchMemory({
				appName: "app",
				userId: "user",
				query,
			}),
		).resolves.toEqual({ memories: [] });
	});

	it('quoted query token "hello" includes quote characters and misses', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("hello"));
		await expect(
			service.searchMemory({
				appName: "app",
				userId: "user",
				query: '"hello"',
			}),
		).resolves.toEqual({ memories: [] });
	});

	it("OR with punctuation miss + clean hit still matches", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("alpha beta"));
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "alpha! beta",
				})
			).memories,
		).toHaveLength(1);
	});
});
