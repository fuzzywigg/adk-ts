import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after providers #269 / tip `03ff90a` / #258):
 * `event.content?.parts` truthiness — fourteenth pins falsy `0`/`false` drop;
 * nineteenth pins number `1` keep. SameValueZero residual: `-0` is likewise
 * falsy (`!!(-0)` false) even though `Object.is(-0, 0)` is false → event
 * filtered out (skip arm).
 */
describe("in-memory memory parts negzero falsy-skip twentieth leftover", () => {
	it("parts -0 is falsy → event filtered out", async () => {
		expect(!!-0).toBe(false);
		expect(Object.is(-0, 0)).toBe(false);
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
					content: { parts: -0 as any },
				} as any,
			],
			lastUpdateTime: 1,
		} as Session);
		const stored = (service as any)._sessionEvents.get("app/user").get("s1");
		expect(stored).toHaveLength(0);
	});

	it("parts 0 still filtered out (fourteenth control)", async () => {
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

	it("parts 1 still indexed (nineteenth control)", async () => {
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
		const stored = (service as any)._sessionEvents.get("app/user").get("s1");
		expect(stored).toHaveLength(1);
	});
});
