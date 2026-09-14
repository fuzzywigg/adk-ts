import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Type } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileOperationsTool } from "../../../tools/common/file-operations-tool";
import { UserInteractionTool } from "../../../tools/common/user-interaction-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("FileOperationsTool heavy matrix leftover edges", () => {
	let basePath: string;
	let tool: FileOperationsTool;

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-file-hm-"));
		tool = new FileOperationsTool({ basePath });
	});

	afterEach(async () => {
		await fs.rm(basePath, { recursive: true, force: true });
	});

	it("declares operation and filepath as required", () => {
		const declaration = tool.getDeclaration();
		expect(tool.name).toBe("file_operations");
		expect(declaration.parameters?.required).toEqual(["operation", "filepath"]);
		expect(declaration.parameters?.properties?.operation?.enum).toEqual([
			"read",
			"write",
			"append",
			"delete",
			"exists",
			"list",
			"mkdir",
		]);
	});

	it("defaults basePath to process.cwd when omitted", () => {
		const cwdTool = new FileOperationsTool();
		expect(cwdTool.name).toBe("file_operations");
	});

	it("round-trips write/read/append content", async () => {
		await expect(
			tool.runAsync(
				{ operation: "write", filepath: "a.txt", content: "hello" },
				makeContext(),
			),
		).resolves.toMatchObject({ success: true });
		await expect(
			tool.runAsync({ operation: "read", filepath: "a.txt" }, makeContext()),
		).resolves.toEqual({ success: true, data: "hello" });
		await tool.runAsync(
			{ operation: "append", filepath: "a.txt", content: "!" },
			makeContext(),
		);
		await expect(
			tool.runAsync({ operation: "read", filepath: "a.txt" }, makeContext()),
		).resolves.toEqual({ success: true, data: "hello!" });
	});

	it("exists/list/mkdir/delete cover directory workflows", async () => {
		await expect(
			tool.runAsync(
				{ operation: "exists", filepath: "missing.txt" },
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: false });

		await tool.runAsync(
			{ operation: "write", filepath: "dir/a.txt", content: "a" },
			makeContext(),
		);
		await expect(
			tool.runAsync(
				{ operation: "exists", filepath: "dir/a.txt" },
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: true });

		await expect(
			tool.runAsync(
				{ operation: "mkdir", filepath: "nested/dir" },
				makeContext(),
			),
		).resolves.toMatchObject({ success: true });

		const listed = await tool.runAsync(
			{ operation: "list", filepath: "dir" },
			makeContext(),
		);
		expect(listed.success).toBe(true);
		expect(
			(listed.data as Array<{ name: string }>).map((entry) => entry.name),
		).toContain("a.txt");

		await expect(
			tool.runAsync(
				{ operation: "delete", filepath: "dir/a.txt" },
				makeContext(),
			),
		).resolves.toMatchObject({ success: true });
		await expect(
			tool.runAsync(
				{ operation: "exists", filepath: "dir/a.txt" },
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: false });
	});

	it("rejects paths outside the base directory", async () => {
		const outside = path.join(os.tmpdir(), "outside-adk.txt");
		const result = await tool.runAsync(
			{ operation: "read", filepath: outside },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/Access denied/i);
	});

	it("rejects relative traversal outside base", async () => {
		const result = await tool.runAsync(
			{ operation: "read", filepath: "../escape.txt" },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/Access denied/i);
	});

	it("returns error for unsupported operations", async () => {
		const result = await tool.runAsync(
			{ operation: "chmod" as any, filepath: "a.txt" },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/Unsupported operation/i);
	});

	it("write with missing content writes empty string", async () => {
		await tool.runAsync(
			{ operation: "write", filepath: "empty.txt" },
			makeContext(),
		);
		await expect(
			tool.runAsync(
				{ operation: "read", filepath: "empty.txt" },
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: "" });
	});

	it("read of missing file returns failure", async () => {
		const result = await tool.runAsync(
			{ operation: "read", filepath: "nope.txt" },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toBeTruthy();
	});
});

describe("UserInteractionTool heavy matrix leftover edges", () => {
	it("exposes long-running metadata with required prompt", () => {
		const tool = new UserInteractionTool();
		const declaration = tool.getDeclaration();
		expect(tool.name).toBe("user_interaction");
		expect(tool.isLongRunning).toBe(true);
		expect(declaration.parameters?.required).toEqual(["prompt"]);
		expect(declaration.parameters?.type).toBe(Type.OBJECT);
	});

	it("errors when promptUser is unavailable", async () => {
		const tool = new UserInteractionTool();
		await expect(
			tool.runAsync({ prompt: "hi" }, { actions: {} } as ToolContext),
		).resolves.toEqual({
			success: false,
			error: "User interaction is not supported in the current environment",
		});
	});

	it("errors when actions is missing", async () => {
		const tool = new UserInteractionTool();
		await expect(
			tool.runAsync({ prompt: "hi" }, {} as ToolContext),
		).resolves.toEqual({
			success: false,
			error: "User interaction is not supported in the current environment",
		});
	});

	it("prompts with choices and skips summarization when available", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("Alice");
		const skipSummarization = vi.fn();
		const result = await tool.runAsync(
			{
				prompt: "Name?",
				defaultValue: "Guest",
				options: ["Alice", "Bob"],
			},
			{
				actions: { promptUser, skipSummarization },
			} as unknown as ToolContext,
		);
		expect(result).toEqual({ success: true, userInput: "Alice" });
		expect(skipSummarization).toHaveBeenCalledWith(true);
		expect(promptUser).toHaveBeenCalledWith({
			prompt: "Name?",
			defaultValue: "Guest",
			options: { choices: ["Alice", "Bob"] },
		});
	});

	it("omits choices when options array is empty", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockResolvedValue("ok");
		await tool.runAsync({ prompt: "Go?", options: [] }, {
			actions: { promptUser },
		} as unknown as ToolContext);
		expect(promptUser).toHaveBeenCalledWith({
			prompt: "Go?",
			defaultValue: undefined,
			options: undefined,
		});
	});

	it("returns failure when promptUser rejects", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockRejectedValue(new Error("cancelled"));
		await expect(
			tool.runAsync({ prompt: "x" }, {
				actions: { promptUser },
			} as unknown as ToolContext),
		).resolves.toEqual({ success: false, error: "cancelled" });
	});

	it("stringifies non-Error promptUser rejections", async () => {
		const tool = new UserInteractionTool();
		const promptUser = vi.fn().mockRejectedValue("nope");
		await expect(
			tool.runAsync({ prompt: "x" }, {
				actions: { promptUser },
			} as unknown as ToolContext),
		).resolves.toEqual({ success: false, error: "nope" });
	});
});
