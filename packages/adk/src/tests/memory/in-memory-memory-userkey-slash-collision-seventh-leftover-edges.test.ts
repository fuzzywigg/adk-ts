import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

function sessionFor(
	appName: string,
	userId: string,
	text: string,
	id = "s1",
): Session {
	return {
		appName,
		userId,
		id,
		state: {},
		events: [
			{
				author: "user",
				timestamp: 1,
				content: { parts: [{ text }] },
			} as any,
		],
		lastUpdateTime: 1,
	};
}

/**
 * Seventh leftover: _userKey is `${appName}/${userId}` so slashes in either
 * segment collide with a different identity that serializes the same.
 */
describe("in-memory memory userKey slash collision seventh leftover", () => {
	it("appName 'a/b' + userId 'c' collides with appName 'a' + userId 'b/c'", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(sessionFor("a/b", "c", "alphaword", "s1"));
		await service.addSessionToMemory(sessionFor("a", "b/c", "betaword", "s2"));

		const fromFirst = await service.searchMemory({
			appName: "a/b",
			userId: "c",
			query: "betaword",
		});
		expect(fromFirst.memories).toHaveLength(1);

		const fromSecond = await service.searchMemory({
			appName: "a",
			userId: "b/c",
			query: "alphaword",
		});
		expect(fromSecond.memories).toHaveLength(1);

		const keys = [...(service as any)._sessionEvents.keys()];
		expect(keys).toEqual(["a/b/c"]);
	});

	it("same userKey different session ids stay isolated (overwrite is per session id)", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(sessionFor("a/b", "c", "keepme", "s1"));
		await service.addSessionToMemory(sessionFor("a", "b/c", "other", "s2"));
		expect(
			(
				await service.searchMemory({
					appName: "a/b",
					userId: "c",
					query: "keepme",
				})
			).memories,
		).toHaveLength(1);
		expect(
			(
				await service.searchMemory({
					appName: "a",
					userId: "b/c",
					query: "other",
				})
			).memories,
		).toHaveLength(1);
	});

	it("colliding identities overwrite when session ids match", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(sessionFor("a/b", "c", "oldtoken", "s1"));
		await service.addSessionToMemory(sessionFor("a", "b/c", "newtoken", "s1"));
		expect(
			(
				await service.searchMemory({
					appName: "a/b",
					userId: "c",
					query: "oldtoken",
				})
			).memories,
		).toEqual([]);
		expect(
			(
				await service.searchMemory({
					appName: "a",
					userId: "b/c",
					query: "newtoken",
				})
			).memories,
		).toHaveLength(1);
	});

	it("slash-free neighbor keys do not collide", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(sessionFor("ab", "c", "one", "s1"));
		await service.addSessionToMemory(sessionFor("a", "bc", "two", "s1"));
		expect(
			(
				await service.searchMemory({
					appName: "ab",
					userId: "c",
					query: "two",
				})
			).memories,
		).toEqual([]);
		expect(
			(
				await service.searchMemory({
					appName: "a",
					userId: "bc",
					query: "one",
				})
			).memories,
		).toEqual([]);
	});
});
