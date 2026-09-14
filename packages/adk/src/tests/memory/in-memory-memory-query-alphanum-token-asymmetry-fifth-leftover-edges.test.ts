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
 * Leftover asymmetry: query tokens keep digits (split on spaces only), but
 * event extraction drops non-letters via /[A-Za-z]+/g. So query "order123"
 * never equals event word "order", while query "order" can hit.
 */
describe("in-memory memory query-alphanum token asymmetry fifth leftover edges", () => {
	it("query 'order' hits event 'order 12345 code'", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("order 12345 code"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "order",
		});
		expect(result.memories).toHaveLength(1);
	});

	it("query 'order123' misses event word 'order'", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("order 12345 code"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "order123",
		});
		expect(result.memories).toEqual([]);
	});

	it("query '12345' misses because event digits are not extracted", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("order 12345 code"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "12345",
		});
		expect(result.memories).toEqual([]);
	});

	it("event 'order123' extracts word 'order' — query 'order' hits, 'order123' misses", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("order123"));
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "order",
				})
			).memories,
		).toHaveLength(1);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "order123",
				})
			).memories,
		).toEqual([]);
	});

	it("hyphenated event 'well-known' extracts well+known; query keeps hyphen token", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("well-known fact"));
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "well",
				})
			).memories,
		).toHaveLength(1);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "known",
				})
			).memories,
		).toHaveLength(1);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "well-known",
				})
			).memories,
		).toEqual([]);
	});

	it("underscore event 'snake_case' extracts snake+case; query token keeps underscore", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("snake_case token"));
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "snake",
				})
			).memories,
		).toHaveLength(1);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "snake_case",
				})
			).memories,
		).toEqual([]);
	});

	it("OR semantics: alphanum miss + letter hit still matches", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("pure letters only"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "order123 letters",
		});
		expect(result.memories).toHaveLength(1);
	});

	it("camelCase event extracts as one word; query camel/case miss separately", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("camelCase"));
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "camelcase",
				})
			).memories,
		).toHaveLength(1);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "camel",
				})
			).memories,
		).toEqual([]);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "case",
				})
			).memories,
		).toEqual([]);
	});
});
