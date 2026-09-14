import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

/**
 * Seventeenth leftover: `event.content?.parts` truthiness — fifteenth keeps
 * string `"0"` / `"false"` then searchMemory throws on `.filter`. Boolean
 * `true` is likewise truthy non-array → indexed then `.filter` TypeError.
 */
describe("in-memory memory parts boolean-true truthy seventeenth leftover", () => {
	it("parts true is truthy → event indexed", async () => {
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
					content: { parts: true },
				} as any,
			],
			lastUpdateTime: 1,
		};
		await service.addSessionToMemory(session);
		const stored = (service as any)._sessionEvents.get("app/user").get("s1");
		expect(stored).toHaveLength(1);
		expect(stored[0].content.parts).toBe(true);
	});

	it("searchMemory with parts true throws TypeError on .filter", async () => {
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
