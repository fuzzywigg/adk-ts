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
import type { Session } from "../../sessions/session";
import type { Event } from "../../events/event";

/**
 * Seventeenth leftover: ctor `ragCorpus ? [{ rag_corpus }] : []` — fifteenth
 * pins string `"0"` / `"false"` wire. Boolean `true` is likewise truthy and
 * wires rag_resources (corpus_name coerces when logged/passed).
 */
describe("vertex-rag corpus boolean-true truthy seventeenth leftover", () => {
	function makeSession(): Session {
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
		};
	}

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

	it("boolean true ragCorpus wires rag_resources", async () => {
		const service = new VertexAiRagMemoryService(true as any);
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(makeSession());
		expect(upload).toHaveBeenCalledWith(
			expect.objectContaining({ corpus_name: true }),
		);
	});

	it('string "false" still wires (fifteenth control)', async () => {
		const service = new VertexAiRagMemoryService("false");
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(makeSession());
		expect(upload).toHaveBeenCalledWith(
			expect.objectContaining({ corpus_name: "false" }),
		);
	});

	it("boolean false ragCorpus still rejects (fifth control)", async () => {
		const service = new VertexAiRagMemoryService(false as any);
		await expect(service.addSessionToMemory(makeSession())).rejects.toThrow(
			/Rag resources must be set/,
		);
	});
});
