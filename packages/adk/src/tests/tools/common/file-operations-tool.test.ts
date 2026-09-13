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
});
