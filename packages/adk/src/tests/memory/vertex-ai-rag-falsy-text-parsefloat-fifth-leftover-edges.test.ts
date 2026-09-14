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

function makeSession(overrides?: Partial<Session>): Session {
	return {
		id: "sess-5",
		appName: "app",
		userId: "user",
		state: {},
		events: [],
		lastUpdateTime: 1,
		...overrides,
	};
}

describe("VertexAiRagMemoryService falsy text / parseFloat fifth leftover (post #165)", () => {
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
		{ label: '""', text: "" },
		{ label: "null", text: null },
		{ label: "undefined", text: undefined },
		{ label: "0", text: 0 },
		{ label: "false", text: false },
	] as const)("addSessionToMemory filters falsy part.text ($label) via truthy filter", async ({
		text,
	}) => {
		const service = new VertexAiRagMemoryService("corpus");
		vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "a",
						timestamp: 1,
						content: {
							parts: [{ text: text as any }, { text: "kept" }],
						},
					} as Event,
				],
			}),
		);
		expect(writeFileSync.mock.calls[0][1]).toBe(
			JSON.stringify({ author: "a", timestamp: 1, text: "kept" }),
		);
	});

	it("addSessionToMemory replaces newlines in text with spaces before join", async () => {
		const service = new VertexAiRagMemoryService("corpus");
		vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "u",
						timestamp: 2,
						content: {
							parts: [{ text: "a\nb\nc" }, { text: "d\ne" }],
						},
					} as Event,
				],
			}),
		);
		expect(writeFileSync.mock.calls[0][1]).toBe(
			JSON.stringify({ author: "u", timestamp: 2, text: "a b c.d e" }),
		);
	});

	it.each([
		{
			label: "null fields",
			payload: { author: null, timestamp: null, text: null },
			expectedAuthor: "",
			expectedTs: new Date(0).toISOString(),
			expectedText: "",
		},
		{
			label: "empty strings",
			payload: { author: "", timestamp: "", text: "" },
			expectedAuthor: "",
			expectedTs: new Date(0).toISOString(),
			expectedText: "",
		},
		{
			label: "false/0 asymmetries",
			payload: { author: false, timestamp: 0, text: false },
			expectedAuthor: "",
			expectedTs: new Date(0).toISOString(),
			expectedText: "",
		},
	] as const)("searchMemory author/timestamp/text || defaults: $label", async ({
		payload,
		expectedAuthor,
		expectedTs,
		expectedText,
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
		expect(result.memories[0].author).toBe(expectedAuthor);
		expect(result.memories[0].timestamp).toBe(expectedTs);
		expect(result.memories[0].content.parts?.[0]?.text).toBe(expectedText);
	});

	it("searchMemory parseFloat keeps numeric string timestamps", async () => {
		const service = new VertexAiRagMemoryService("c");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.s1",
						text: JSON.stringify({
							author: "u",
							timestamp: "12.5",
							text: "hi",
						}),
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(result.memories[0].timestamp).toBe(new Date(12.5).toISOString());
	});

	it("constructor ragCorpus falsy yields empty rag_resources (add throws)", async () => {
		for (const corpus of [undefined, "", null] as const) {
			const service = new VertexAiRagMemoryService(corpus as any);
			await expect(service.addSessionToMemory(makeSession())).rejects.toThrow(
				/Rag resources must be set/,
			);
		}
	});
});
