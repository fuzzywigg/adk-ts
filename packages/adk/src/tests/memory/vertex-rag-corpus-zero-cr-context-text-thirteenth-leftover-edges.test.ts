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
import type { Event } from "../../events/event";
import type { Session } from "../../sessions/session";

function makeSession(overrides?: Partial<Session>): Session {
	return {
		id: "sess",
		appName: "app",
		userId: "user",
		state: {},
		events: [
			{
				author: "user",
				timestamp: 1,
				content: { parts: [{ text: "hello" }] },
			} as Event,
		],
		lastUpdateTime: 1,
		...overrides,
	};
}

/**
 * Thirteenth leftover: `ragCorpus ? [...] : []` treats 0/false as empty.
 * Fifth leftover covers ""/null/undefined + whitespace truthy.
 * Also: `.replace(/\n/g)` leaves `\r`; `if (context.text)` skips 0/false.
 */
describe("vertex-rag corpus 0/false CR context-text thirteenth leftover", () => {
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
		{ label: "0", ragCorpus: 0 as any },
		{ label: "false", ragCorpus: false as any },
	])("$label ragCorpus yields empty rag_resources via truthy ?", async ({
		ragCorpus,
	}) => {
		const service = new VertexAiRagMemoryService(ragCorpus);
		await expect(service.addSessionToMemory(makeSession())).rejects.toThrow(
			/Rag resources must be set/,
		);
	});

	it("CR in part.text is not replaced (only \\n → space)", async () => {
		const service = new VertexAiRagMemoryService("corpus");
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(
			makeSession({
				events: [
					{
						author: "user",
						timestamp: 1,
						content: { parts: [{ text: "a\rb" }] },
					} as Event,
				],
			}),
		);
		expect(writeFileSync).toHaveBeenCalled();
		const written = writeFileSync.mock.calls[0][1] as string;
		const parsed = JSON.parse(written.trim());
		expect(parsed.text).toBe("a\rb");
		expect(parsed.text).toContain("\r");
		expect(upload).toHaveBeenCalled();
	});

	it.each([
		{ label: "0", text: 0 },
		{ label: "false", text: false },
	])("context.text $label is falsy → no memories", async ({ text }) => {
		const service = new VertexAiRagMemoryService("corpus");
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.sess",
						text,
					},
				],
			},
		});
		const result = await service.searchMemory({
			appName: "app",
			userId: "user",
			query: "q",
		});
		expect(result.memories).toEqual([]);
	});
});
