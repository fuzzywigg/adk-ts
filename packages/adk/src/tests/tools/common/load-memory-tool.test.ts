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

	it("treats missing memories as an empty list with count 0", async () => {
		const tool = new LoadMemoryTool();
		const context = {
			actions: {},
			searchMemory: vi.fn().mockResolvedValue({}),
		} as unknown as ToolContext;

		await expect(
			tool.runAsync({ query: "anything" }, context),
		).resolves.toEqual({
			memories: [],
			count: 0,
		});
	});

	it("returns count 0 for an explicit empty memories array", async () => {
		const tool = new LoadMemoryTool();
		const context = {
			actions: {},
			searchMemory: vi.fn().mockResolvedValue({ memories: [] }),
		} as unknown as ToolContext;

		await expect(tool.runAsync({ query: "none" }, context)).resolves.toEqual({
			memories: [],
			count: 0,
		});
	});

	it("stringifies non-Error rejections in the error payload", async () => {
		const tool = new LoadMemoryTool();
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const context = {
			actions: {},
			searchMemory: vi.fn().mockRejectedValue("quota exceeded"),
		} as unknown as ToolContext;

		await expect(tool.runAsync({ query: "facts" }, context)).resolves.toEqual({
			error: "Memory search failed",
			message: "quota exceeded",
		});
		expect(errorSpy).toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	it("exposes load_memory metadata and query property shape", () => {
		const tool = new LoadMemoryTool();
		const declaration = tool.getDeclaration();

		expect(tool.name).toBe("load_memory");
		expect(tool.description).toContain("memory");
		expect(declaration.parameters?.properties?.query).toMatchObject({
			type: "STRING",
			description: "The query to load memories for",
		});
	});
});
