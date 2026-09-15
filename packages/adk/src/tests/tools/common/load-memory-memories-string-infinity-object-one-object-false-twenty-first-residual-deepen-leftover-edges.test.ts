import { describe, expect, it, vi } from "vitest";
import { LoadMemoryTool } from "../../../tools/common/load-memory-tool";
import type { ToolContext } from "../../../tools/tool-context";

/**
 * Twenty-first leftover residual deepen (complements #287 `"true"`/`"1"`/`{}`):
 * string `"Infinity"` kept with `.length` 8; `Object(1)` / `Object(false)`
 * truthy with undefined `.length` → count 0 (boxed peers of empty-object).
 */
describe("load-memory memories string-infinity/object-one/object-false twenty-first residual deepen", () => {
	it('memories string "Infinity" kept with count 8 via ?.length || 0', async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories: "Infinity" });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			memories: "Infinity",
			count: 8,
		});
	});

	it("memories Object(1) kept with count 0 (undefined length || 0)", async () => {
		const boxed = Object(1);
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories: boxed });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		const result = await tool.runAsync({ query: "q" }, context);
		expect(result.memories).toBe(boxed);
		expect(result.count).toBe(0);
	});

	it("memories Object(false) kept with count 0 (boxed truthy, undefined length)", async () => {
		const boxed = Object(false);
		expect(Boolean(boxed)).toBe(true);
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories: boxed });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		const result = await tool.runAsync({ query: "q" }, context);
		expect(result.memories).toBe(boxed);
		expect(result.count).toBe(0);
	});

	it("memories {} still kept with count 0 (twentieth control)", async () => {
		const empty: any = {};
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories: empty });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			memories: empty,
			count: 0,
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
