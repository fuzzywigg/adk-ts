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
 * Twelfth leftover: `_userKey` Map lookup is case-sensitive. Query tokens
 * fold case; appName/userId keys do not. Distinct from seventh slash collision.
 */
describe("in-memory memory userKey Map case-sensitivity twelfth leftover", () => {
	it("search with cased-differently appName misses stored memories", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(sessionFor("app", "user", "alphaword"));
		const miss = await service.searchMemory({
			appName: "App",
			userId: "user",
			query: "alphaword",
		});
		expect(miss.memories).toEqual([]);
		const hit = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "alphaword",
		});
		expect(hit.memories).toHaveLength(1);
	});

	it("search with cased-differently userId misses stored memories", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(sessionFor("app", "user", "betaword"));
		const miss = await service.searchMemory({
			appName: "app",
			userId: "USER",
			query: "betaword",
		});
		expect(miss.memories).toEqual([]);
	});

	it("query token case-fold still matches when keys are exact", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(sessionFor("app", "user", "GammaWord"));
		const hit = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "gammaword",
		});
		expect(hit.memories).toHaveLength(1);
	});
});
