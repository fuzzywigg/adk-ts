import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after #258):
 * `event.content?.parts` truthiness — nineteenth pins number `1`; eighteenth
 * pins `{}`. String `"true"`, `Infinity`, and nonempty `[1]` are likewise
 * truthy → indexed; non-array then searchMemory `.filter` TypeError (array
 * `[1]` filters by part.text instead).
 */
describe("in-memory memory parts string-true / Infinity truthy twentieth leftover", () => {
	it.each([
		{ label: '"true"', parts: "true" as any },
		{ label: "Infinity", parts: Number.POSITIVE_INFINITY as any },
	])("parts $label is truthy → event indexed + filter throw", async ({
		parts,
	}) => {
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
					content: { parts },
				} as any,
			],
			lastUpdateTime: 1,
		} as Session);
		const stored = (service as any)._sessionEvents.get("app/user").get("s1");
		expect(stored).toHaveLength(1);
		expect(stored[0].content.parts).toBe(parts);
		await expect(
			service.searchMemory({
				appName: "app",
				userId: "user",
				query: "alpha",
			}),
		).rejects.toThrow(/filter is not a function/);
	});

	it("parts [1] indexes but search finds no letter-words", async () => {
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
					content: { parts: [1] as any },
				} as any,
			],
			lastUpdateTime: 1,
		} as Session);
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "alpha",
		});
		expect(result.memories).toEqual([]);
	});

	it("parts 1 still throws (nineteenth control)", async () => {
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
});
