import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

function makeSession(text: string, overrides?: Partial<Session>): Session {
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
 * Leftover asymmetry: query uses query.toLowerCase().split(" ") (space only),
 * while event words use /[A-Za-z]+/g. Tabs/newlines in the query do not split
 * tokens, so a tab-joined query never matches letter-extracted event words.
 */
describe("in-memory memory query-split whitespace asymmetry fifth leftover edges", () => {
	it("space-separated query matches letter words in event", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("hello world"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "hello world",
		});
		expect(result.memories).toHaveLength(1);
	});

	it("tab-joined query does not split and misses event words", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("hello world"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "hello\tworld",
		});
		// wordsInQuery = {"hello\tworld"} — not in {"hello","world"}
		expect(result.memories).toEqual([]);
	});

	it("newline-joined query does not split and misses event words", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("hello world"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "hello\nworld",
		});
		expect(result.memories).toEqual([]);
	});

	it("CRLF-joined query does not split and misses event words", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("alpha beta"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "alpha\r\nbeta",
		});
		expect(result.memories).toEqual([]);
	});

	it("leading/trailing spaces create empty tokens that never match", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("gamma"));
		const emptyish = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "   ",
		});
		expect(emptyish.memories).toEqual([]);

		const paddedHit = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: " gamma ",
		});
		// tokens: "", "gamma", "" — "" never in event words; "gamma" hits
		expect(paddedHit.memories).toHaveLength(1);
	});

	it("double-space creates empty middle token without breaking OR match", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("delta epsilon"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "delta  epsilon",
		});
		expect(result.memories).toHaveLength(1);
	});

	it("event tabs are letter-split but query tab token is not", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("foo\tbar"));
		// event words: foo, bar via /[A-Za-z]+/g
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "foo",
				})
			).memories,
		).toHaveLength(1);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "foo\tbar",
				})
			).memories,
		).toEqual([]);
	});

	it("mixed space and tab: only space-split tokens can hit", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("red green blue"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "red\tgreen blue",
		});
		// tokens: "red\tgreen", "blue" — blue hits
		expect(result.memories).toHaveLength(1);
	});
});
