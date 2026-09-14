import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

function makeSession(overrides?: Partial<Session>): Session {
	return {
		appName: "app",
		userId: "user",
		id: "session-1",
		state: {},
		events: [
			{
				author: "user",
				timestamp: Date.parse("2024-01-01T00:00:00.000Z"),
				content: {
					parts: [{ text: "The weather in Paris is sunny today" }],
				},
			} as any,
		],
		lastUpdateTime: Date.now() / 1000,
		...overrides,
	};
}

describe("InMemoryMemoryService leftover edges (post #124)", () => {
	it("searchMemory skips injected events missing content or parts", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(makeSession());

		const userKey = "app/user";
		const sessions = (service as any)._sessionEvents.get(userKey) as Map<
			string,
			Event[]
		>;
		const existing = sessions.get("session-1") || [];
		sessions.set("session-1", [
			...existing,
			{ author: "ghost" } as Event,
			{
				author: "empty",
				content: { role: "model" },
			} as Event,
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "Paris forecast update" }] },
			}),
		]);

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "paris",
		});

		expect(hits.memories.length).toBeGreaterThanOrEqual(1);
		expect(
			hits.memories.every(
				(m) => m.content?.parts && m.content.parts.length > 0,
			),
		).toBe(true);
	});

	it("searchMemory continues past empty text parts without matching", async () => {
		const service = new InMemoryMemoryService();
		const userKey = "app/user";
		(service as any)._sessionEvents.set(
			userKey,
			new Map([
				[
					"s1",
					[
						{
							author: "user",
							content: {
								parts: [{ inlineData: { mimeType: "x", data: "y" } }],
							},
						},
						{
							author: "user",
							content: { parts: [{ text: "Berlin cold" }] },
						},
					],
				],
			]),
		);

		const berlin = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "berlin",
		});
		expect(berlin.memories).toHaveLength(1);

		const paris = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "paris",
		});
		expect(paris.memories).toEqual([]);
	});

	it("addSessionToMemory filters events without content.parts before search", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory(
			makeSession({
				events: [
					{ author: "user" } as any,
					{
						author: "user",
						content: { parts: [{ text: "keep London rain" }] },
					} as any,
				],
			}),
		);

		const hits = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "london",
		});
		expect(hits.memories).toHaveLength(1);
		expect(hits.memories[0].content?.parts?.[0]?.text).toContain("London");
	});
});
