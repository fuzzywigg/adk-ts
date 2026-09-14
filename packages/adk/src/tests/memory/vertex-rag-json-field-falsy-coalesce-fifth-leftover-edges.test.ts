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

import type { Event } from "../../events/event";
import {
	rag,
	VertexAiRagMemoryService,
} from "../../memory/vertex-ai-rag-memory-service";
import type { Session } from "../../sessions/session";

describe("VertexAiRagMemoryService JSON field falsy coalesce fifth leftover", () => {
	beforeEach(() => {
		unlinkSync.mockReset();
		unlinkSync.mockImplementation(() => undefined);
		writeFileSync.mockReset();
		writeFileSync.mockImplementation(() => undefined);
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		{
			label: "author null",
			payload: { author: null, timestamp: 1, text: "t" },
			expectAuthor: "",
			expectText: "t",
		},
		{
			label: "author empty",
			payload: { author: "", timestamp: 1, text: "t" },
			expectAuthor: "",
			expectText: "t",
		},
		{
			label: "author 0",
			payload: { author: 0, timestamp: 1, text: "t" },
			expectAuthor: "",
			expectText: "t",
		},
		{
			label: "author false",
			payload: { author: false, timestamp: 1, text: "t" },
			expectAuthor: "",
			expectText: "t",
		},
		{
			label: "text null",
			payload: { author: "a", timestamp: 1, text: null },
			expectAuthor: "a",
			expectText: "",
		},
		{
			label: "text 0",
			payload: { author: "a", timestamp: 1, text: 0 },
			expectAuthor: "a",
			expectText: "",
		},
		{
			label: "text false",
			payload: { author: "a", timestamp: 1, text: false },
			expectAuthor: "a",
			expectText: "",
		},
		{
			label: "timestamp null → parseFloat('0')",
			payload: { author: "a", timestamp: null, text: "t" },
			expectAuthor: "a",
			expectText: "t",
			expectTsZeroish: true,
		},
		{
			label: "timestamp empty → parseFloat('0')",
			payload: { author: "a", timestamp: "", text: "t" },
			expectAuthor: "a",
			expectText: "t",
			expectTsZeroish: true,
		},
		{
			label: "timestamp 0 kept via || '0' then parseFloat",
			payload: { author: "a", timestamp: 0, text: "t" },
			expectAuthor: "a",
			expectText: "t",
			expectTsZeroish: true,
		},
	])("$label", async ({
		payload,
		expectAuthor,
		expectText,
		expectTsZeroish,
	}) => {
		const service = new VertexAiRagMemoryService("c");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify(payload),
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(result.memories).toHaveLength(1);
		expect(result.memories[0].author).toBe(expectAuthor);
		expect(result.memories[0].content.parts?.[0]?.text).toBe(expectText);
		if (expectTsZeroish) {
			expect(result.memories[0].timestamp).toBe(new Date(0).toISOString());
		}
	});

	it("addSessionToMemory drops empty-string part.text via truthy filter", async () => {
		const service = new VertexAiRagMemoryService("c");
		vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory({
			id: "s",
			appName: "app",
			userId: "user",
			state: {},
			lastUpdateTime: 1,
			events: [
				{
					author: "u",
					timestamp: 1,
					content: {
						parts: [{ text: "" }, { text: "kept" }, { text: null as any }],
					},
				} as Event,
			],
		} as Session);
		expect(writeFileSync.mock.calls[0][1]).toBe(
			JSON.stringify({ author: "u", timestamp: 1, text: "kept" }),
		);
	});

	it("addSessionToMemory keeps whitespace-only part.text (truthy)", async () => {
		const service = new VertexAiRagMemoryService("c");
		vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory({
			id: "s",
			appName: "app",
			userId: "user",
			state: {},
			lastUpdateTime: 1,
			events: [
				{
					author: "u",
					timestamp: 2,
					content: { parts: [{ text: "  " }] },
				} as Event,
			],
		} as Session);
		expect(writeFileSync.mock.calls[0][1]).toBe(
			JSON.stringify({ author: "u", timestamp: 2, text: "  " }),
		);
	});
});
