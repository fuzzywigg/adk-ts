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
 * Thirteenth leftover: query uses `.split(" ")` only. Fifth leftover covers
 * tab/newline/CRLF. NBSP / form-feed / vertical-tab do not split either.
 */
describe("in-memory memory query NBSP/formfeed split thirteenth leftover", () => {
	it.each([
		{ label: "NBSP", sep: "\u00a0" },
		{ label: "form-feed", sep: "\f" },
		{ label: "vertical-tab", sep: "\v" },
	])("$label-joined query does not split and misses event words", async ({
		sep,
	}) => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("hello world"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: `hello${sep}world`,
		});
		expect(result.memories).toEqual([]);
	});

	it("single-word query still matches letter-extracted events", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("hello\u00a0world"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "hello",
		});
		expect(result.memories).toHaveLength(1);
	});

	it("space-separated query still matches (fifth control)", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("hello world"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "hello world",
		});
		expect(result.memories).toHaveLength(1);
	});
});
