import { describe, expect, it, vi } from "vitest";
import { LoadMemoryTool } from "../../../tools/common/load-memory-tool";
import type { ToolContext } from "../../../tools/tool-context";

/**
 * Nineteenth leftover: `memories || []` and `length || 0` — string "0"/"false"
 * are truthy non-arrays kept with string `.length` count (seventh covers other
 * truthy non-arrays and falsy coalesce, but not these string primitives).
 */
describe("load-memory memories/count string-zero/false nineteenth leftover", () => {
	it.each([
		{ memories: "0", expectedCount: 1 },
		{ memories: "false", expectedCount: 5 },
	] as const)("memories: $memories kept with count $expectedCount via ?.length || 0", async ({
		memories,
		expectedCount,
	}) => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			memories,
			count: expectedCount,
		});
	});

	it("numeric 0 memories still coalesces to [] with count 0 (control)", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories: 0 });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			memories: [],
			count: 0,
		});
	});
});
