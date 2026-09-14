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
 * Leftover beyond #164 fifth: query.split(" ") keeps empty tokens for "" and
 * multi-space gaps. Empty query word never appears in letter-extracted event
 * words, so "" alone never matches; OR with a real word still can.
 */
describe("in-memory memory sixth leftover: empty / whitespace query tokens", () => {
	it('empty query yields [""] token and misses letter events', async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("hello world"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "",
		});
		expect(result.memories).toEqual([]);
	});

	it("spaces-only query yields empty tokens and misses", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("hello world"));
		for (const query of [" ", "  ", "\t", " \t "]) {
			const result = await service.searchMemory({
				appName: "app",
				userId: "user",
				query,
			});
			expect(result.memories).toEqual([]);
		}
	});

	it("double-space embeds empty token but letter OR still matches", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("alpha beta"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "alpha  ",
		});
		expect(result.memories).toHaveLength(1);
	});

	it("leading space empty token + miss word still fails", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("alpha beta"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: " missing",
		});
		expect(result.memories).toEqual([]);
	});

	it("query token case fold: HELLO hits hello event", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("Hello World"));
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "HELLO",
		});
		expect(result.memories).toHaveLength(1);
	});

	it("unknown userKey returns empty without scanning", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession("hello"));
		await expect(
			service.searchMemory({
				appName: "other",
				userId: "user",
				query: "hello",
			}),
		).resolves.toEqual({ memories: [] });
	});
});
