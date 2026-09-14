import { describe, expect, it, vi } from "vitest";
import { LoadMemoryTool } from "../../../tools/common/load-memory-tool";
import type { ToolContext } from "../../../tools/tool-context";

describe("LoadMemoryTool memories truthy-nonarray seventh leftover (post #158)", () => {
	it.each([
		{
			label: 'string "ab"',
			memories: "ab",
			expectedMemories: "ab",
			expectedCount: 2,
		},
		{
			label: "array-like {length:3}",
			memories: { length: 3 },
			expectedMemories: { length: 3 },
			expectedCount: 3,
		},
		{
			label: "number 1",
			memories: 1,
			expectedMemories: 1,
			expectedCount: 0,
		},
		{
			label: "true",
			memories: true,
			expectedMemories: true,
			expectedCount: 0,
		},
	] as const)("passes through truthy non-array memories ($label) via memories || [] / ?.length || 0", async ({
		memories,
		expectedMemories,
		expectedCount,
	}) => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			memories: expectedMemories,
			count: expectedCount,
		});
	});

	it.each([
		{ label: "0", memories: 0 },
		{ label: '""', memories: "" },
		{ label: "false", memories: false },
		{ label: "null", memories: null },
		{ label: "undefined", memories: undefined },
	] as const)("coalesces falsy memories ($label) to [] with count 0", async ({
		memories,
	}) => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			memories: [],
			count: 0,
		});
	});
});
