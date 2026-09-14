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

/**
 * Fourteenth leftover: `if (!event.content || !event.content.parts)` on
 * addSessionToMemory — fifth covers falsy part.text; `parts: false`/`0`
 * skip the event entirely so no JSONL line is written.
 */
describe("vertex-rag addSession parts falsy primitive fourteenth leftover", () => {
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
		{ label: "false", parts: false },
		{ label: "0", parts: 0 },
		{ label: '""', parts: "" },
	])("parts $label skipped — only kept event written", async ({ parts }) => {
		vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		const service = new VertexAiRagMemoryService("corpus");
		await service.addSessionToMemory({
			id: "s",
			appName: "app",
			userId: "user",
			state: {},
			lastUpdateTime: 1,
			events: [
				{
					author: "skip",
					timestamp: 1,
					content: { parts },
				} as Event,
				{
					author: "keep",
					timestamp: 2,
					content: { parts: [{ text: "hello" }] },
				} as Event,
			],
		} as Session);

		expect(writeFileSync.mock.calls[0][1]).toBe(
			JSON.stringify({ author: "keep", timestamp: 2, text: "hello" }),
		);
	});

	it("empty parts array writes nothing for that event (control)", async () => {
		vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		const service = new VertexAiRagMemoryService("corpus");
		await service.addSessionToMemory({
			id: "s",
			appName: "app",
			userId: "user",
			state: {},
			lastUpdateTime: 1,
			events: [
				{
					author: "empty",
					timestamp: 1,
					content: { parts: [] },
				} as Event,
			],
		} as Session);
		expect(writeFileSync.mock.calls[0][1]).toBe("");
	});
});
