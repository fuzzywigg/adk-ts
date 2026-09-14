import { describe, expect, it, vi } from "vitest";
import { LoadMemoryTool } from "../../../tools/common/load-memory-tool";
import type { ToolContext } from "../../../tools/tool-context";

describe("LoadMemoryTool", () => {
	it("declares a required query parameter", () => {
		const tool = new LoadMemoryTool();
		const declaration = tool.getDeclaration();

		expect(declaration.name).toBe("load_memory");
		expect(declaration.parameters?.required).toEqual(["query"]);
	});

	it("returns memories from searchMemory", async () => {
		const tool = new LoadMemoryTool();
		const memories = [{ content: { parts: [{ text: "fact" }] } }];
		const context = {
			actions: {},
			searchMemory: vi.fn().mockResolvedValue({ memories }),
		} as unknown as ToolContext;

		await expect(tool.runAsync({ query: "facts" }, context)).resolves.toEqual({
			memories,
			count: 1,
		});
		expect(context.searchMemory).toHaveBeenCalledWith("facts");
	});

	it("returns structured errors when memory search fails", async () => {
		const tool = new LoadMemoryTool();
		const context = {
			actions: {},
			searchMemory: vi.fn().mockRejectedValue(new Error("offline")),
		} as unknown as ToolContext;
		vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(tool.runAsync({ query: "facts" }, context)).resolves.toEqual({
			error: "Memory search failed",
			message: "offline",
		});
	});

	it("defaults memories to [] and count to 0 when memories is missing", async () => {
		const tool = new LoadMemoryTool();
		const context = {
			actions: {},
			searchMemory: vi.fn().mockResolvedValue({}),
		} as unknown as ToolContext;

		await expect(tool.runAsync({ query: "empty" }, context)).resolves.toEqual({
			memories: [],
			count: 0,
		});
	});

	it("defaults memories to [] when memories is undefined explicitly", async () => {
		const tool = new LoadMemoryTool();
		const context = {
			actions: {},
			searchMemory: vi.fn().mockResolvedValue({ memories: undefined }),
		} as unknown as ToolContext;

		await expect(tool.runAsync({ query: "none" }, context)).resolves.toEqual({
			memories: [],
			count: 0,
		});
	});

	it("stringifies non-Error rejections from searchMemory", async () => {
		const tool = new LoadMemoryTool();
		const context = {
			actions: {},
			searchMemory: vi.fn().mockRejectedValue("memory-down"),
		} as unknown as ToolContext;
		vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(tool.runAsync({ query: "facts" }, context)).resolves.toEqual({
			error: "Memory search failed",
			message: "memory-down",
		});
	});

	it("exposes load_memory metadata description", () => {
		const tool = new LoadMemoryTool();
		expect(tool.name).toBe("load_memory");
		expect(tool.description).toMatch(/memory/i);
		expect(
			tool.getDeclaration().parameters?.properties?.query?.description,
		).toMatch(/query/i);
	});

	it("returns empty list with count 0 for empty memories array", async () => {
		const tool = new LoadMemoryTool();
		const context = {
			actions: {},
			searchMemory: vi.fn().mockResolvedValue({ memories: [] }),
		} as unknown as ToolContext;

		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			memories: [],
			count: 0,
		});
	});
});
