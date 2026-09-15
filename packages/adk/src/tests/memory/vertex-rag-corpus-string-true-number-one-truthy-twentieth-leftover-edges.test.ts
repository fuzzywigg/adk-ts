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
 * Twentieth leftover (HEAVY tip-relaunch residual after providers #269 / tip `03ff90a` / #258):
 * ctor `ragCorpus ? [{ rag_corpus }] : []` — seventeenth pins boolean `true`;
 * fifteenth pins `"0"`/`"false"`. String `"true"` and number `1` likewise wire
 * rag_resources (distinct from falsy 0/`-0` empty).
 */
describe("vertex-rag corpus string-true / number-one truthy twentieth leftover", () => {
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

	it('string "true" ragCorpus wires rag_resources', async () => {
		const service = new VertexAiRagMemoryService("true");
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(makeSession());
		expect(upload).toHaveBeenCalledWith(
			expect.objectContaining({ corpus_name: "true" }),
		);
	});

	it("number 1 ragCorpus wires rag_resources", async () => {
		const service = new VertexAiRagMemoryService(1 as any);
		const upload = vi.spyOn(rag, "upload_file").mockResolvedValue(undefined);
		await service.addSessionToMemory(makeSession());
		expect(upload).toHaveBeenCalledWith(
			expect.objectContaining({ corpus_name: 1 }),
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

	it("numeric -0 still rejects (falsy SameValueZero residual)", async () => {
		expect(!!-0).toBe(false);
		const service = new VertexAiRagMemoryService(-0 as any);
		await expect(service.addSessionToMemory(makeSession())).rejects.toThrow(
			/Rag resources must be set/,
		);
	});
});
