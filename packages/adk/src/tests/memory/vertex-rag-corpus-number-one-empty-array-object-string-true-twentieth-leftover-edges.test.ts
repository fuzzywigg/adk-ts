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

/**
 * Twentieth leftover: ctor `ragCorpus ? [{ rag_corpus }] : []` — seventeenth
 * pins boolean `true`; fifteenth pins `"0"` / `"false"`. Number `1`, empty
 * array `[]`, empty object `{}`, and string `"true"` are likewise truthy and
 * wire rag_resources through upload_file.
 */
describe("vertex-rag corpus number-one/empty-array-object/string-true twentieth leftover", () => {
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

	it("number 1 ragCorpus wires rag_resources", async () => {
		const service = new VertexAiRagMemoryService(1 as any);
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(makeSession());
		expect(upload).toHaveBeenCalledWith(
			expect.objectContaining({ corpus_name: 1 }),
		);
	});

	it("empty array [] ragCorpus wires rag_resources", async () => {
		const empty: any = [];
		const service = new VertexAiRagMemoryService(empty);
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(makeSession());
		expect(upload).toHaveBeenCalledWith(
			expect.objectContaining({ corpus_name: empty }),
		);
	});

	it("empty object {} ragCorpus wires rag_resources", async () => {
		const empty: any = {};
		const service = new VertexAiRagMemoryService(empty);
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(makeSession());
		expect(upload).toHaveBeenCalledWith(
			expect.objectContaining({ corpus_name: empty }),
		);
	});

	it('string "true" ragCorpus wires rag_resources', async () => {
		const service = new VertexAiRagMemoryService("true");
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(makeSession());
		expect(upload).toHaveBeenCalledWith(
			expect.objectContaining({ corpus_name: "true" }),
		);
	});

	it("boolean true still wires (seventeenth control)", async () => {
		const service = new VertexAiRagMemoryService(true as any);
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(makeSession());
		expect(upload).toHaveBeenCalledWith(
			expect.objectContaining({ corpus_name: true }),
		);
	});

	it("boolean false ragCorpus still rejects (fifth control)", async () => {
		const service = new VertexAiRagMemoryService(false as any);
		await expect(service.addSessionToMemory(makeSession())).rejects.toThrow(
			/Rag resources must be set/,
		);
	});
});
