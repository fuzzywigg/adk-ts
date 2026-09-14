import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

/**
 * Nineteenth leftover: `event.content?.parts` truthiness — eighteenth keeps
 * empty object `{}`; seventeenth keeps boolean `true`. Number `1` is likewise
 * truthy non-array → indexed then `.filter` TypeError.
 */
describe("in-memory memory parts number-one truthy nineteenth leftover", () => {
	it("parts 1 is truthy → event indexed", async () => {
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
					content: { parts: 1 },
				} as any,
			],
			lastUpdateTime: 1,
		};
		await service.addSessionToMemory(session);
		const stored = (service as any)._sessionEvents.get("app/user").get("s1");
		expect(stored).toHaveLength(1);
		expect(stored[0].content.parts).toBe(1);
	});

	it("searchMemory with parts 1 throws TypeError on .filter", async () => {
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
					content: { parts: 1 },
				} as any,
			],
			lastUpdateTime: 1,
		} as Session);
		await expect(
			service.searchMemory({
				appName: "app",
				userId: "user",
				query: "alpha",
			}),
		).rejects.toThrow(/filter is not a function/);
	});

	it("parts {} still indexed + throws (eighteenth control)", async () => {
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
					content: { parts: {} },
				} as any,
			],
			lastUpdateTime: 1,
		} as Session);
		const stored = (service as any)._sessionEvents.get("app/user").get("s1");
		expect(stored).toHaveLength(1);
		await expect(
			service.searchMemory({
				appName: "app",
				userId: "user",
				query: "alpha",
			}),
		).rejects.toThrow(/filter is not a function/);
	});

	it("falsy parts 0 still filtered out (fourteenth control)", async () => {
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
					content: { parts: 0 },
				} as any,
			],
			lastUpdateTime: 1,
		} as Session);
		const stored = (service as any)._sessionEvents.get("app/user").get("s1");
		expect(stored).toHaveLength(0);
	});
});
