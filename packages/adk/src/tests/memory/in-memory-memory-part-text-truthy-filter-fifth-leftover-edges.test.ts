import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

function makeSession(
	events: Array<{ author: string; text?: string; parts?: unknown }>,
	overrides?: Partial<Session>,
): Session {
	return {
		appName: "app",
		userId: "user",
		id: "session-1",
		state: {},
		events: events.map(
			(e, i) =>
				({
					author: e.author,
					timestamp: i + 1,
					content: e.parts
						? { parts: e.parts }
						: e.text !== undefined
							? { parts: [{ text: e.text }] }
							: undefined,
				}) as any,
		),
		lastUpdateTime: Date.now() / 1000,
		...overrides,
	};
}

/**
 * Leftover: part.text filter is truthy — empty string / null / undefined text
 * parts are dropped before join, while whitespace-only text is kept and may
 * still yield zero extractable words.
 */
describe("in-memory memory part-text truthy filter fifth leftover edges", () => {
	it("empty-string text parts are filtered out before join", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession([
				{
					author: "hit",
					parts: [{ text: "" }, { text: "keepword" }, { text: "" }],
				},
			]),
		);
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "keepword",
		});
		expect(result.memories).toHaveLength(1);
	});

	it("null/undefined text parts are filtered; only real text joins", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession([
				{
					author: "hit",
					parts: [{ text: null }, { text: "alpha" }, { text: undefined }, {}],
				},
			]),
		);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "alpha",
				})
			).memories,
		).toHaveLength(1);
	});

	it("whitespace-only text is truthy so kept, but yields no letter words", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession([
				{ author: "blank", parts: [{ text: "   \t\n" }] },
				{ author: "hit", text: "realword" },
			]),
		);
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "realword",
		});
		expect(result.memories.map((m) => m.author)).toEqual(["hit"]);
	});

	it("zero/false as text are falsy and filtered from join", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession([
				{
					author: "hit",
					parts: [{ text: 0 as any }, { text: "zeta" }, { text: false as any }],
				},
			]),
		);
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "zeta",
		});
		expect(result.memories).toHaveLength(1);
	});

	it("addSessionToMemory keeps events with empty parts array (truthy parts)", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession([
				{ author: "empty-parts", parts: [] },
				{ author: "hit", text: "later" },
			]),
		);
		// empty parts stored but search skips (no words)
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "later",
		});
		expect(result.memories.map((m) => m.author)).toEqual(["hit"]);
	});

	it("multi-part join preserves spaces between kept texts only", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession([
				{
					author: "multi",
					parts: [
						{ text: "hello" },
						{ text: "" },
						{ text: "world" },
						{ inlineData: { data: "x" } },
					],
				},
			]),
		);
		// filter keeps hello + world → "hello world"
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
					query: "world",
				})
			).memories,
		).toHaveLength(1);
	});
});
