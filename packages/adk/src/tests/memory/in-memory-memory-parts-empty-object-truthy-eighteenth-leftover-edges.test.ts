import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

/**
 * Eighteenth leftover: `event.content?.parts` truthiness — seventeenth keeps
 * boolean `true` then searchMemory throws on `.filter`. Empty object `{}` is
 * likewise truthy non-array → indexed then `.filter` TypeError.
 */
describe("in-memory memory parts empty-object truthy eighteenth leftover", () => {
	it("parts {} is truthy → event indexed", async () => {
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
					content: { parts: {} },
				} as any,
			],
			lastUpdateTime: 1,
		};
		await service.addSessionToMemory(session);
		const stored = (service as any)._sessionEvents.get("app/user").get("s1");
		expect(stored).toHaveLength(1);
		expect(stored[0].content.parts).toEqual({});
	});

	it("searchMemory with parts {} throws TypeError on .filter", async () => {
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
		await expect(
			service.searchMemory({
				appName: "app",
				userId: "user",
				query: "alpha",
			}),
		).rejects.toThrow(/filter is not a function/);
	});

	it("parts true still indexed + throws (seventeenth control)", async () => {
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
					content: { parts: true },
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

	it("falsy parts false still filtered out (fourteenth control)", async () => {
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
					content: { parts: false },
				} as any,
			],
			lastUpdateTime: 1,
		} as Session);
		const stored = (service as any)._sessionEvents.get("app/user").get("s1");
		expect(stored).toHaveLength(0);
	});
});
