import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		unlinkSync: vi.fn(),
		writeFileSync: vi.fn(),
	};
});

import {
	rag,
	VertexAiRagMemoryService,
} from "../../memory/vertex-ai-rag-memory-service";

function jsonLine(
	author: string,
	timestamp: number | string,
	text: string,
): string {
	return JSON.stringify({ author, timestamp, text });
}

describe("VertexAiRagMemoryService leftover: non-numeric timestamp → NaN → formatTimestamp throws", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const nanTimestamps = ["not-a-number", "NaN", "abc", "---", " "];

	for (const timestamp of nanTimestamps) {
		it(`searchMemory rejects when timestamp=${JSON.stringify(timestamp)} parses to NaN`, async () => {
			vi.spyOn(rag, "retrieval_query").mockResolvedValue({
				contexts: {
					contexts: [
						{
							source_display_name: "app.user.s1",
							text: jsonLine("u", timestamp, "payload"),
						},
					],
				},
			});
			const service = new VertexAiRagMemoryService("corpus");
			await expect(
				service.searchMemory({ appName: "app", userId: "user", query: "q" }),
			).rejects.toThrow(RangeError);
		});
	}

	it("searchMemory rejects Infinityish partial parse → Infinity → formatTimestamp RangeError", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: jsonLine("u", "Infinityish", "payload"),
					},
				],
			},
		});
		const service = new VertexAiRagMemoryService("corpus");
		await expect(
			service.searchMemory({ appName: "app", userId: "user", query: "q" }),
		).rejects.toThrow(RangeError);
		expect(Number.parseFloat("Infinityish")).toBe(Number.POSITIVE_INFINITY);
	});

	it("still succeeds for clean numeric string timestamps", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: jsonLine("u", "42", "ok"),
					},
				],
			},
		});
		const service = new VertexAiRagMemoryService("corpus");
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].timestamp).toBe(new Date(42).toISOString());
	});
});
