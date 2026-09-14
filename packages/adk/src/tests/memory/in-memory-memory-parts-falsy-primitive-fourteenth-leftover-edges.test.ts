import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import type { Session } from "../../sessions/session";

/**
 * Fourteenth leftover: `event.content?.parts` truthiness in addSessionToMemory.
 * Sixth covers [] kept and null filtered. Primitive `false` / `0` are falsy
 * → event dropped (not indexed).
 */
describe("in-memory memory parts falsy primitive fourteenth leftover", () => {
	it.each([
		{ label: "false", parts: false },
		{ label: "0", parts: 0 },
		{ label: '""', parts: "" },
	])("parts $label is falsy → event filtered out", async ({ parts }) => {
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
				{
					author: "user",
					timestamp: 2,
					content: { parts: [{ text: "alpha" }] },
				} as any,
			],
			lastUpdateTime: 1,
		};
		await service.addSessionToMemory(session);
		const stored = (service as any)._sessionEvents.get("app/user").get("s1");
		expect(stored).toHaveLength(1);
		expect(stored[0].author).toBe("user");
		expect(stored[0].content.parts[0].text).toBe("alpha");
	});

	it("empty array parts still indexed (sixth control)", async () => {
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
					content: { parts: [] },
				} as any,
			],
			lastUpdateTime: 1,
		} as Session);
		const stored = (service as any)._sessionEvents.get("app/user").get("s1");
		expect(stored).toHaveLength(1);
		expect(stored[0].content.parts).toEqual([]);
	});
});
