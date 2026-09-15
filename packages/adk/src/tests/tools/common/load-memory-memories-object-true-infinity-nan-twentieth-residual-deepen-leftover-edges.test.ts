import { describe, expect, it, vi } from "vitest";
import { LoadMemoryTool } from "../../../tools/common/load-memory-tool";
import type { ToolContext } from "../../../tools/tool-context";

/**
 * Twentieth leftover residual deepen (complements #287 `"true"`/`"1"`/`{}`
 * counts): `memories || []` / `?.length || 0` — `Object(true)` / `Infinity`
 * are truthy with undefined `.length` → count 0; `NaN` is falsy →
 * coalesces to `[]` with count 0 (asymmetry vs string `"true"` length 4).
 */
describe("load-memory memories object-true/Infinity/NaN twentieth residual deepen", () => {
	it("memories Object(true) kept with count 0 (undefined length || 0)", async () => {
		const boxed = Object(true) as any;
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories: boxed });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			memories: boxed,
			count: 0,
		});
	});

	it("memories Infinity kept with count 0 (undefined length || 0)", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi
			.fn()
			.mockResolvedValue({ memories: Number.POSITIVE_INFINITY });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			memories: Number.POSITIVE_INFINITY,
			count: 0,
		});
	});

	it('memories string "Infinity" kept with count 8 via ?.length', async () => {
		expect("Infinity".length).toBe(8);
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories: "Infinity" });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			memories: "Infinity",
			count: 8,
		});
	});

	it("memories NaN coalesces to [] with count 0 (falsy asymmetry)", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories: Number.NaN });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			memories: [],
			count: 0,
		});
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
});
