import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileOperationsTool } from "../../../tools/common/file-operations-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("FileOperationsTool", () => {
	let basePath: string;
	let tool: FileOperationsTool;

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-file-ops-"));
		tool = new FileOperationsTool({ basePath });
	});

	afterEach(async () => {
		await fs.rm(basePath, { recursive: true, force: true });
	});

	it("writes, reads, and appends file content", async () => {
		const writeResult = await tool.runAsync(
			{ operation: "write", filepath: "notes.txt", content: "hello" },
			makeContext(),
		);
		expect(writeResult.success).toBe(true);

		const readResult = await tool.runAsync(
			{ operation: "read", filepath: "notes.txt" },
			makeContext(),
		);
		expect(readResult).toEqual({ success: true, data: "hello" });

		const appendResult = await tool.runAsync(
			{ operation: "append", filepath: "notes.txt", content: " world" },
			makeContext(),
		);
		expect(appendResult.success).toBe(true);

		const reread = await tool.runAsync(
			{ operation: "read", filepath: "notes.txt" },
			makeContext(),
		);
		expect(reread.data).toBe("hello world");
	});

	it("checks existence, lists directory, creates dirs, and deletes files", async () => {
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

		const mkdirResult = await tool.runAsync(
			{ operation: "mkdir", filepath: "nested/dir" },
			makeContext(),
		);
		expect(mkdirResult.success).toBe(true);

		const listResult = await tool.runAsync(
			{ operation: "list", filepath: "dir" },
			makeContext(),
		);
		expect(listResult.success).toBe(true);
		expect(listResult.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "a.txt", isFile: true }),
			]),
		);

		const deleteResult = await tool.runAsync(
			{ operation: "delete", filepath: "dir/a.txt" },
			makeContext(),
		);
		expect(deleteResult.success).toBe(true);
		await expect(
			tool.runAsync(
				{ operation: "exists", filepath: "dir/a.txt" },
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: false });
	});

	it("denies path escape outside the base directory", async () => {
		const result = await tool.runAsync(
			{ operation: "read", filepath: "../outside.txt" },
			makeContext(),
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Access denied");
	});

	it("exposes declaration with required operation and filepath", () => {
		const declaration = tool.getDeclaration();
		expect(declaration.name).toBe("file_operations");
		expect(declaration.parameters?.required).toEqual(["operation", "filepath"]);
		expect(declaration.parameters?.properties?.operation?.enum).toEqual(
			expect.arrayContaining(["read", "write", "list", "mkdir"]),
		);
	});

	it("returns failure for missing reads/deletes and unsupported operations", async () => {
		await expect(
			tool.runAsync(
				{ operation: "read", filepath: "missing.txt" },
				makeContext(),
			),
		).resolves.toEqual(
			expect.objectContaining({
				success: false,
				error: expect.stringMatching(/no such file|ENOENT|not found/i),
			}),
		);

		await expect(
			tool.runAsync(
				{ operation: "delete", filepath: "missing.txt" },
				makeContext(),
			),
		).resolves.toEqual(
			expect.objectContaining({
				success: false,
			}),
		);

		await expect(
			tool.runAsync(
				{ operation: "unknown" as any, filepath: "x.txt" },
				makeContext(),
			),
		).resolves.toEqual(
			expect.objectContaining({
				success: false,
				error: expect.stringMatching(/unsupported|unknown/i),
			}),
		);
	});

	it("defaults basePath to process.cwd when omitted", () => {
		const cwdTool = new FileOperationsTool();
		expect(cwdTool.getDeclaration().name).toBe("file_operations");
	});

	it("writes empty content when content is omitted and supports custom encoding", async () => {
		const writeResult = await tool.runAsync(
			{ operation: "write", filepath: "empty.txt" },
			makeContext(),
		);
		expect(writeResult.success).toBe(true);

		const readResult = await tool.runAsync(
			{ operation: "read", filepath: "empty.txt", encoding: "utf8" },
			makeContext(),
		);
		expect(readResult).toEqual({ success: true, data: "" });

		await tool.runAsync(
			{
				operation: "append",
				filepath: "empty.txt",
				content: "x",
				encoding: "utf8",
			},
			makeContext(),
		);
		const reread = await tool.runAsync(
			{ operation: "read", filepath: "empty.txt" },
			makeContext(),
		);
		expect(reread.data).toBe("x");
	});

	it("allows absolute paths that remain inside the base directory", async () => {
		const absolute = path.join(basePath, "abs.txt");
		const writeResult = await tool.runAsync(
			{ operation: "write", filepath: absolute, content: "abs" },
			makeContext(),
		);
		expect(writeResult.success).toBe(true);

		const readResult = await tool.runAsync(
			{ operation: "read", filepath: absolute },
			makeContext(),
		);
		expect(readResult.data).toBe("abs");
	});

	it("denies absolute paths outside the base directory", async () => {
		const outside = path.join(os.tmpdir(), `adk-outside-${Date.now()}.txt`);
		const result = await tool.runAsync(
			{ operation: "read", filepath: outside },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Access denied");
	});

	it("does not treat a path-prefix sibling of basePath as inside the sandbox", async () => {
		const siblingBase = `${basePath}-sibling`;
		await fs.mkdir(siblingBase, { recursive: true });
		try {
			const siblingFile = path.join(siblingBase, "secret.txt");
			await fs.writeFile(siblingFile, "nope");
			const result = await tool.runAsync(
				{ operation: "read", filepath: siblingFile },
				makeContext(),
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Access denied");
		} finally {
			await fs.rm(siblingBase, { recursive: true, force: true });
		}
	});

	it("returns failure when listing a missing directory", async () => {
		const result = await tool.runAsync(
			{ operation: "list", filepath: "missing-dir" },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/Failed to list directory/i);
	});
});
