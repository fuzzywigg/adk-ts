import { describe, expect, it, vi } from "vitest";
import { GetUserChoiceTool } from "../../../tools/common/get-user-choice-tool";
import { LoadMemoryTool } from "../../../tools/common/load-memory-tool";
import type { ToolContext } from "../../../tools/tool-context";

describe("GetUserChoiceTool matrix leftover edges", () => {
	it("exposes get_user_choice metadata as long-running with options required", () => {
		const tool = new GetUserChoiceTool();
		expect(tool.name).toBe("get_user_choice");
		expect(tool.isLongRunning).toBe(true);
		const declaration = tool.getDeclaration();
		expect(declaration.parameters?.required).toEqual(["options"]);
		expect(declaration.parameters?.properties).toHaveProperty("options");
		expect(declaration.parameters?.properties).toHaveProperty("question");
	});

	it("returns null and sets skipSummarization while logging options", async () => {
		const tool = new GetUserChoiceTool();
		const debug = vi.spyOn((tool as any).logger, "debug");
		const context = { actions: {} } as ToolContext;
		await expect(
			tool.runAsync({ options: ["a", "b"], question: "pick one" }, context),
		).resolves.toBeNull();
		expect(context.actions.skipSummarization).toBe(true);
		expect(debug).toHaveBeenCalled();
	});

	it("still returns null for empty options arrays", async () => {
		const tool = new GetUserChoiceTool();
		const context = { actions: {} } as ToolContext;
		await expect(tool.runAsync({ options: [] }, context)).resolves.toBeNull();
		expect(context.actions.skipSummarization).toBe(true);
	});

	it("overwrites a prior skipSummarization false to true", async () => {
		const tool = new GetUserChoiceTool();
		const context = { actions: { skipSummarization: false } } as ToolContext;
		await tool.runAsync({ options: ["only"] }, context);
		expect(context.actions.skipSummarization).toBe(true);
	});
});

describe("LoadMemoryTool matrix leftover edges", () => {
	it("exposes load_memory metadata with required query", () => {
		const tool = new LoadMemoryTool();
		expect(tool.name).toBe("load_memory");
		const declaration = tool.getDeclaration();
		expect(declaration.parameters?.required).toEqual(["query"]);
	});

	it("forwards query to searchMemory and returns memories with count", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({
			memories: [{ text: "hit" }],
		});
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "needle" }, context)).resolves.toEqual({
			memories: [{ text: "hit" }],
			count: 1,
		});
		expect(searchMemory).toHaveBeenCalledWith("needle");
	});

	it("returns an error envelope when searchMemory rejects", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockRejectedValue(new Error("offline"));
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			error: "Memory search failed",
			message: "offline",
		});
		expect(error).toHaveBeenCalled();
	});

	it("stringifies non-Error searchMemory rejections", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockRejectedValue("down");
		vi.spyOn(console, "error").mockImplementation(() => {});
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			error: "Memory search failed",
			message: "down",
		});
	});

	it("accepts empty query strings and reports zero count", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories: [] });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "" }, context)).resolves.toEqual({
			memories: [],
			count: 0,
		});
		expect(searchMemory).toHaveBeenCalledWith("");
	});

	it("defaults missing memories arrays to empty with count 0", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({});
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "x" }, context)).resolves.toEqual({
			memories: [],
			count: 0,
		});
	});
});
