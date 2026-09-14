import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

function makeSession(
	parts: Array<{ text?: any }>,
	overrides: Partial<Session> = {},
): Session {
	return {
		appName: "app",
		userId: "user",
		id: "session-1",
		state: {},
		events: [
			{
				author: "user",
				timestamp: Date.parse("2024-06-01T00:00:00.000Z"),
				content: { parts },
			} as any,
		],
		lastUpdateTime: Date.now() / 1000,
		...overrides,
	};
}

/**
 * Thirteenth leftover: searchMemory extracts event words via /[A-Za-z]+/g.
 * Digits-only / punctuation-only / whitespace-only text yields empty
 * wordsInEvent and is skipped even when query tokens would otherwise OR-match.
 * Distinct from fifth/sixth query-side digit/empty-token leftovers.
 */
describe("in-memory memory digits-only event skip thirteenth leftover", () => {
	it("digits-only event text never matches letter query", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession([{ text: "12345 67890" }]));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "hello",
		});
		expect(result.memories).toEqual([]);
	});

	it("punctuation-only event text is skipped", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession([{ text: "!!! ??? ---" }]));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "hello",
		});
		expect(result.memories).toEqual([]);
	});

	it("whitespace-only event text is skipped", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession([{ text: "   \t\n  " }]));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "hello",
		});
		expect(result.memories).toEqual([]);
	});

	it("digits mixed with letters still extract letter tokens", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession([{ text: "order123 code456 zebra" }]),
		);
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "zebra",
		});
		expect(result.memories).toHaveLength(1);
	});

	it("query digits still miss letter-only events (fifth control)", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession([{ text: "order code" }]));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "12345",
		});
		expect(result.memories).toEqual([]);
	});
});
