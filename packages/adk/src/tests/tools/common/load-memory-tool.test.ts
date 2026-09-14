import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { LoadMemoryTool } from "../../../tools/common/load-memory-tool";
import type { ToolContext } from "../../../tools/tool-context";

describe("LoadMemoryTool", () => {
	it("exposes load_memory metadata", () => {
		const tool = new LoadMemoryTool();
		expect(tool.name).toBe("load_memory");
		expect(tool.description).toContain("Loads the memory");
		expect(tool.isLongRunning).toBe(false);
	});

	it("declares a required query parameter", () => {
		const tool = new LoadMemoryTool();
		const declaration = tool.getDeclaration();

		expect(declaration.name).toBe("load_memory");
		expect(declaration.description).toBe(tool.description);
		expect(declaration.parameters?.type).toBe(Type.OBJECT);
		expect(declaration.parameters?.required).toEqual(["query"]);
		expect(declaration.parameters?.properties?.query).toEqual({
			type: Type.STRING,
			description: "The query to load memories for",
		});
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
		expect(context.searchMemory).toHaveBeenCalledTimes(1);
	});

	it("passes the query string verbatim including whitespace", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories: [] });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;

		await tool.runAsync({ query: "  spaced query  " }, context);

		expect(searchMemory).toHaveBeenCalledWith("  spaced query  ");
	});

	it("returns empty memories and count 0 when memories is undefined", async () => {
		const tool = new LoadMemoryTool();
		const context = {
			actions: {},
			searchMemory: vi.fn().mockResolvedValue({}),
		} as unknown as ToolContext;

		await expect(tool.runAsync({ query: "x" }, context)).resolves.toEqual({
			memories: [],
			count: 0,
		});
	});

	it("returns empty memories and count 0 for an empty list", async () => {
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

	it("counts multiple memories", async () => {
		const tool = new LoadMemoryTool();
		const memories = [
			{ content: { parts: [{ text: "a" }] } },
			{ content: { parts: [{ text: "b" }] } },
			{ content: { parts: [{ text: "c" }] } },
		];
		const context = {
			actions: {},
			searchMemory: vi.fn().mockResolvedValue({ memories }),
		} as unknown as ToolContext;

		await expect(tool.runAsync({ query: "multi" }, context)).resolves.toEqual({
			memories,
			count: 3,
		});
	});

	it("returns structured errors when memory search fails with Error", async () => {
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

	it("stringifies non-Error rejections in the error message", async () => {
		const tool = new LoadMemoryTool();
		const context = {
			actions: {},
			searchMemory: vi.fn().mockRejectedValue("backend-down"),
		} as unknown as ToolContext;
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		await expect(tool.runAsync({ query: "facts" }, context)).resolves.toEqual({
			error: "Memory search failed",
			message: "backend-down",
		});
		expect(consoleError).toHaveBeenCalled();
	});

	it("does not mutate context.actions on success or failure", async () => {
		const tool = new LoadMemoryTool();
		const successContext = {
			actions: { escalate: false },
			searchMemory: vi.fn().mockResolvedValue({ memories: [] }),
		} as unknown as ToolContext;

		await tool.runAsync({ query: "ok" }, successContext);
		expect(successContext.actions).toEqual({ escalate: false });

		const failContext = {
			actions: { transferToAgent: "x" },
			searchMemory: vi.fn().mockRejectedValue(new Error("fail")),
		} as unknown as ToolContext;
		vi.spyOn(console, "error").mockImplementation(() => {});

		await tool.runAsync({ query: "bad" }, failContext);
		expect(failContext.actions).toEqual({ transferToAgent: "x" });
	});
});
