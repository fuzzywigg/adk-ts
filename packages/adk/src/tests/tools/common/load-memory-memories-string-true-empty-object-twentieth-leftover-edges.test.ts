import { describe, expect, it, vi } from "vitest";
import { LoadMemoryTool } from "../../../tools/common/load-memory-tool";
import type { ToolContext } from "../../../tools/tool-context";

/**
 * Twentieth leftover: `memories || []` and `length || 0` — nineteenth pins
 * string `"0"` / `"false"` truthy non-arrays with string `.length` count.
 * String `"true"` / `"1"` likewise keep with length 4 / 1; empty object `{}`
 * is truthy with undefined `.length` → count 0 (distinct from string paths).
 */
describe("load-memory memories string-true/one / empty-object twentieth leftover", () => {
	it.each([
		{ memories: "true", expectedCount: 4 },
		{ memories: "1", expectedCount: 1 },
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

	it("memories {} kept with count 0 (undefined length || 0)", async () => {
		const empty: any = {};
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories: empty });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			memories: empty,
			count: 0,
		});
	});

	it('string "0" still kept with count 1 (nineteenth control)', async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories: "0" });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			memories: "0",
			count: 1,
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
