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

describe("VertexAiRagMemoryService leftover: trailing-dot display_name → empty sessionId", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("app.user. passes startsWith but pop() yields empty session key", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.",
						text: jsonLine("a", 1, "from-empty"),
					},
					{
						source_display_name: "app.user.",
						text: jsonLine("b", 2, "also-empty-key"),
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
		expect(result.memories.map((m) => m.author).sort()).toEqual(["a", "b"]);
		expect(
			"app.user.".startsWith("app.user.") &&
				"app.user.".split(".").pop() === "",
		).toBe(true);
	});

	it("double-trailing-dot app.user.. also collapses to empty sessionId", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user..",
						text: jsonLine("z", 3, "double-dot"),
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
		expect(result.memories[0].author).toBe("z");
		expect("app.user..".split(".").pop()).toBe("");
	});

	it("merges trailing-dot contexts with explicit empty sessionId bucket", async () => {
		vi.spyOn(rag, "retrieval_query").mockResolvedValue({
			contexts: {
				contexts: [
					{
						source_display_name: "app.user.",
						text: `${jsonLine("a", 1, "one")}\n${jsonLine("b", 2, "two")}`,
					},
					{
						source_display_name: "app.user.",
						text: `${jsonLine("c", 2, "dup")}\n${jsonLine("d", 3, "three")}`,
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
		const authors = result.memories.map((m) => m.author);
		expect(authors).toEqual(expect.arrayContaining(["a", "b", "d"]));
		expect(authors).not.toContain("c");
	});
});
