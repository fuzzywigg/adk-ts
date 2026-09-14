import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

/**
 * Fifteenth leftover: `event.content?.parts` truthiness — fourteenth drops
 * falsy `false`/`0`/`""`. String `"0"` / `"false"` are truthy → event
 * indexed; searchMemory then throws on `.filter` (non-array parts).
 */
describe("in-memory memory parts string-zero-false truthy fifteenth leftover", () => {
	it.each([
		{ label: '"0"', parts: "0" },
		{ label: '"false"', parts: "false" },
	])("parts $label is truthy → event indexed", async ({ parts }) => {
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
					content: { parts },
				} as any,
			],
			lastUpdateTime: 1,
		};
		await service.addSessionToMemory(session);
		const stored = (service as any)._sessionEvents.get("app/user").get("s1");
		expect(stored).toHaveLength(1);
		expect(stored[0].content.parts).toBe(parts);
	});

	it('searchMemory with parts "0" throws TypeError on .filter', async () => {
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
					content: { parts: "0" },
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
