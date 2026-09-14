import { describe, expect, it } from "vitest";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service";
import { formatTimestamp } from "../../memory/_utils";
import type { Session } from "../../sessions/session";

/**
 * Leftover: searchMemory formats event.timestamp via formatTimestamp.
 * Date / string / number arms differ; invalid Date / NaN number throw during search.
 */
describe("in-memory memory sixth leftover: timestamp format arms in search", () => {
	async function searchWithTimestamp(timestamp: any) {
		const service = new InMemoryMemoryService();
		const session: Session = {
			appName: "app",
			userId: "user",
			id: "s1",
			state: {},
			events: [
				{
					author: "agent",
					timestamp,
					content: { parts: [{ text: "needle" }] },
				} as any,
			],
			lastUpdateTime: 1,
		};
		await service.addSessionToMemory(session);
		return service.searchMemory({
			appName: "app",
			userId: "user",
			query: "needle",
		});
	}

	it("number epoch ms becomes ISO in memory entry", async () => {
		const ms = Date.parse("2024-03-01T12:00:00.000Z");
		const result = await searchWithTimestamp(ms);
		expect(result.memories[0]?.timestamp).toBe("2024-03-01T12:00:00.000Z");
	});

	it("string timestamp passes through unchanged", async () => {
		const result = await searchWithTimestamp("custom-ts");
		expect(result.memories[0]?.timestamp).toBe("custom-ts");
	});

	it("Date instance becomes ISO", async () => {
		const result = await searchWithTimestamp(
			new Date("2023-01-01T00:00:00.000Z"),
		);
		expect(result.memories[0]?.timestamp).toBe("2023-01-01T00:00:00.000Z");
	});

	it("NaN numeric timestamp throws RangeError during search", async () => {
		await expect(searchWithTimestamp(Number.NaN)).rejects.toThrow(RangeError);
	});

	it("Invalid Date timestamp throws RangeError during search", async () => {
		await expect(searchWithTimestamp(new Date(Number.NaN))).rejects.toThrow(
			RangeError,
		);
	});

	it("author is forwarded onto memory entry", async () => {
		const service = new InMemoryMemoryService();
		await service.addSessionToMemory({
			appName: "app",
			userId: "user",
			id: "s1",
			state: {},
			events: [
				{
					author: "special-author",
					timestamp: 0,
					content: { parts: [{ text: "hello" }] },
				} as any,
			],
			lastUpdateTime: 1,
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "hello",
		});
		expect(result.memories[0]?.author).toBe("special-author");
		expect(result.memories[0]?.timestamp).toBe(formatTimestamp(0));
	});
});
