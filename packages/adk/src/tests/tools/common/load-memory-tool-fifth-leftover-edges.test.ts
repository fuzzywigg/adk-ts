import { describe, expect, it, vi } from "vitest";
import { LoadMemoryTool } from "../../../tools/common/load-memory-tool";
import type { ToolContext } from "../../../tools/tool-context";

describe("LoadMemoryTool fifth leftover — memories || quirks / nullish search / empty Error", () => {
	const coalesceRows: Array<{
		label: string;
		memories: unknown;
		expectedMemories: unknown;
		expectedCount: number;
	}> = [
		{
			label: "number 0 → [] / count 0",
			memories: 0,
			expectedMemories: [],
			expectedCount: 0,
		},
		{
			label: "empty string → [] / count 0",
			memories: "",
			expectedMemories: [],
			expectedCount: 0,
		},
		{
			label: "false → [] / count 0",
			memories: false,
			expectedMemories: [],
			expectedCount: 0,
		},
		{
			label: "string hello preserved; count via length",
			memories: "hello",
			expectedMemories: "hello",
			expectedCount: 5,
		},
		{
			label: "true preserved; count 0 via undefined length",
			memories: true,
			expectedMemories: true,
			expectedCount: 0,
		},
		{
			label: "object with length 2 preserved",
			memories: { length: 2, 0: "a", 1: "b" },
			expectedMemories: { length: 2, 0: "a", 1: "b" },
			expectedCount: 2,
		},
		{
			label: "NaN coalesces via || []",
			memories: Number.NaN,
			expectedMemories: [],
			expectedCount: 0,
		},
	];

	for (const row of coalesceRows) {
		it(`memories coalesce: ${row.label}`, async () => {
			const tool = new LoadMemoryTool();
			const searchMemory = vi
				.fn()
				.mockResolvedValue({ memories: row.memories });
			const context = { actions: {}, searchMemory } as unknown as ToolContext;
			await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
				memories: row.expectedMemories,
				count: row.expectedCount,
			});
		});
	}

	it("searchMemory resolving undefined throws into error envelope", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue(undefined);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		const result = await tool.runAsync({ query: "q" }, context);
		expect(result.error).toBe("Memory search failed");
		expect(String(result.message)).toMatch(/memories|undefined|null/i);
		expect(errorSpy).toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	it("searchMemory resolving null throws into error envelope", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue(null);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		const result = await tool.runAsync({ query: "q" }, context);
		expect(result).toMatchObject({ error: "Memory search failed" });
		expect(typeof result.message).toBe("string");
	});

	it("Error with empty message still yields empty message field", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockRejectedValue(new Error(""));
		vi.spyOn(console, "error").mockImplementation(() => {});
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			error: "Memory search failed",
			message: "",
		});
	});

	it("bigint rejection stringifies via String()", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockRejectedValue(10n);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			error: "Memory search failed",
			message: "10",
		});
	});

	it("symbol rejection stringifies via String()", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockRejectedValue(Symbol("mem"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		const result = await tool.runAsync({ query: "q" }, context);
		expect(result.error).toBe("Memory search failed");
		expect(result.message).toContain("Symbol");
	});

	const queryMatrix = ["", " ", "\t", "a".repeat(200), "emoji 🧠", "null"];

	for (const [i, query] of queryMatrix.entries()) {
		it(`forwards query matrix #${i} verbatim to searchMemory`, async () => {
			const tool = new LoadMemoryTool();
			const searchMemory = vi.fn().mockResolvedValue({ memories: [] });
			const context = { actions: {}, searchMemory } as unknown as ToolContext;
			await tool.runAsync({ query }, context);
			expect(searchMemory).toHaveBeenCalledWith(query);
		});
	}
});
