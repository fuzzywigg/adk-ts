import { describe, expect, it, vi } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

/**
 * Leftover: addSessionToMemory filters with `event.content?.parts` truthiness.
 * Empty array [] is truthy → stored. Missing/null parts filtered. Later add
 * for same session id overwrites the prior event list.
 */
describe("in-memory memory sixth leftover: parts truthy filter + overwrite", () => {
	it("keeps events with empty parts array", async () => {
		const service = new InMemoryMemoryService();
		const session: Session = {
			appName: "app",
			userId: "user",
			id: "s1",
			state: {},
			events: [
				{
					author: "user",
					timestamp: 1,
					content: { parts: [] },
				} as any,
				{
					author: "user",
					timestamp: 2,
					content: { parts: [{ text: "hitme" }] },
				} as any,
			],
			lastUpdateTime: 1,
		};
		await service.addSessionToMemory(session);
		const map = (service as any)._sessionEvents.get("app/user") as Map<
			string,
			any[]
		>;
		expect(map.get("s1")).toHaveLength(2);
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "hitme",
		});
		expect(result.memories).toHaveLength(1);
	});

	it("filters events with missing content or null parts", async () => {
		const service = new InMemoryMemoryService();
		const session: Session = {
			appName: "app",
			userId: "user",
			id: "s1",
			state: {},
			events: [
				{ author: "a", timestamp: 1 } as any,
				{ author: "b", timestamp: 2, content: {} } as any,
				{
					author: "c",
					timestamp: 3,
					content: { parts: null },
				} as any,
				{
					author: "d",
					timestamp: 4,
					content: { parts: [{ text: "kept" }] },
				} as any,
			],
			lastUpdateTime: 1,
		};
		await service.addSessionToMemory(session);
		const stored = (service as any)._sessionEvents.get("app/user").get("s1");
		expect(stored).toHaveLength(1);
		expect(stored[0].author).toBe("d");
	});

	it("same session id overwrite replaces prior events", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory({
			appName: "app",
			userId: "user",
			id: "s1",
			state: {},
			events: [
				{
					author: "user",
					timestamp: 1,
					content: { parts: [{ text: "oldtoken" }] },
				} as any,
			],
			lastUpdateTime: 1,
		});
		await service.addSessionToMemory({
			appName: "app",
			userId: "user",
			id: "s1",
			state: {},
			events: [
				{
					author: "user",
					timestamp: 2,
					content: { parts: [{ text: "newtoken" }] },
				} as any,
			],
			lastUpdateTime: 2,
		});
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "oldtoken",
				})
			).memories,
		).toEqual([]);
		expect(
			(
				await service.searchMemory({
					appName: "app",
					userId: "user",
					query: "newtoken",
				})
			).memories,
		).toHaveLength(1);
	});

	it("clear empties all user keys", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory({
			appName: "app",
			userId: "user",
			id: "s1",
			state: {},
			events: [
				{
					author: "user",
					timestamp: 1,
					content: { parts: [{ text: "x" }] },
				} as any,
			],
			lastUpdateTime: 1,
		});
		service.clear();
		await expect(
			service.searchMemory({
				appName: "app",
				userId: "user",
				query: "x",
			}),
		).resolves.toEqual({ memories: [] });
	});

	it("deprecated getAllSessions / getSession warn and return empty", () => {
		const service = new InMemoryMemoryService();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(service.getAllSessions()).toEqual([]);
		expect(service.getSession("any")).toBeUndefined();
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("part.text '0' is truthy and joins into searchable text", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory({
			appName: "app",
			userId: "user",
			id: "s1",
			state: {},
			events: [
				{
					author: "user",
					timestamp: 1,
					content: {
						parts: [{ text: "0" }, { text: "alpha" }],
					},
				} as any,
			],
			lastUpdateTime: 1,
		});
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
});
