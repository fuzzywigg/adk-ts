import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { unlinkSync, writeFileSync } = vi.hoisted(() => ({
	unlinkSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		unlinkSync,
		writeFileSync,
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

describe("VertexAiRagMemoryService display_name prefix case-sensitivity fifth leftover", () => {
	beforeEach(() => {
		unlinkSync.mockReset();
		writeFileSync.mockReset();
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		{
			label: "exact match",
			source: "app.user.s1",
			appName: "app",
			userId: "user",
			keep: true,
		},
		{
			label: "App case miss",
			source: "App.user.s1",
			appName: "app",
			userId: "user",
			keep: false,
		},
		{
			label: "USER case miss",
			source: "app.USER.s1",
			appName: "app",
			userId: "user",
			keep: false,
		},
		{
			label: "prefix with extra segment still matches startsWith",
			source: "app.user.extra.s1",
			appName: "app",
			userId: "user",
			keep: true,
		},
		{
			label: "trailing-dot near-miss",
			source: "app.user",
			appName: "app",
			userId: "user",
			keep: false,
		},
		{
			label: "substring without boundary",
			source: "xapp.user.s1",
			appName: "app",
			userId: "user",
			keep: false,
		},
		{
			label: "whitespace appName in filter",
			source: "app.user.s1",
			appName: "app ",
			userId: "user",
			keep: false,
		},
	])("$label", async ({ source, appName, userId, keep }) => {
		const service = new VertexAiRagMemoryService("c");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: source,
						text: jsonLine("u", 1, "payload"),
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName,
			userId,
			query: "q",
		});
		expect(result.memories).toHaveLength(keep ? 1 : 0);
	});

	it("split('.').pop sessionId uses last segment after prefix pass", async () => {
		const service = new VertexAiRagMemoryService("c");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.mid.sess-z",
						text: jsonLine("a", 1, "x"),
					},
					{
						source_display_name: "app.user.mid.sess-z",
						text: jsonLine("b", 2, "y"),
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(result.memories.map((m) => m.author)).toEqual(["a", "b"]);
	});
});
