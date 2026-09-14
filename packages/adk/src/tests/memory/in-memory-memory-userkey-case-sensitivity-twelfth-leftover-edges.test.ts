import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

function session(opts: {
	appName: string;
	userId: string;
	sessionId: string;
	text: string;
}): Session {
	return {
		id: opts.sessionId,
		appName: opts.appName,
		userId: opts.userId,
		state: {},
		events: [
			{
				author: "agent",
				content: { parts: [{ text: opts.text }] },
			} as any,
		],
		lastUpdateTime: 0,
	} as Session;
}

/**
 * Twelfth leftover: `_userKey` is `${appName}/${userId}` with case-sensitive
 * Map lookup — `App`/`APP` do not share memory with `app`.
 */
describe("in-memory memory userKey case-sensitivity twelfth leftover edges", () => {
	it("search with differently-cased appName misses stored events", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			session({
				appName: "app",
				userId: "user",
				sessionId: "s1",
				text: "findable keyword zebra",
			}),
		);

		const missApp = await service.searchMemory({
			appName: "App",
			userId: "user",
			query: "zebra",
		});
		const missUser = await service.searchMemory({
			appName: "app",
			userId: "USER",
			query: "zebra",
		});
		const hit = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "zebra",
		});

		expect(missApp.memories).toEqual([]);
		expect(missUser.memories).toEqual([]);
		expect(hit.memories).toHaveLength(1);
		expect(hit.memories[0].content.parts?.[0]?.text).toContain("zebra");
	});

	it("App and app can store distinct sessions under the same userId", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			session({
				appName: "app",
				userId: "user",
				sessionId: "s1",
				text: "lower zebra",
			}),
		);
		await service.addSessionToMemory(
			session({
				appName: "App",
				userId: "user",
				sessionId: "s1",
				text: "title zebra",
			}),
		);

		const lower = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "zebra",
		});
		const title = await service.searchMemory({
			appName: "App",
			userId: "user",
			query: "zebra",
		});

		expect(lower.memories[0].content.parts?.[0]?.text).toBe("lower zebra");
		expect(title.memories[0].content.parts?.[0]?.text).toBe("title zebra");
	});
});
