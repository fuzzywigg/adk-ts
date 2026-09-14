import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

	it("returns failure when mkdir targets an existing file path", async () => {
		await tool.runAsync(
			{ operation: "write", filepath: "as-file.txt", content: "x" },
			makeContext(),
		);
		const result = await tool.runAsync(
			{ operation: "mkdir", filepath: "as-file.txt" },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/Failed to create directory/i);
	});

	it("returns failure when writing or appending to a directory path", async () => {
		await tool.runAsync(
			{ operation: "mkdir", filepath: "dir-only" },
			makeContext(),
		);

		const writeResult = await tool.runAsync(
			{ operation: "write", filepath: "dir-only", content: "nope" },
			makeContext(),
		);
		expect(writeResult.success).toBe(false);
		expect(writeResult.error).toMatch(/Failed to write/i);

		const appendResult = await tool.runAsync(
			{ operation: "append", filepath: "dir-only", content: "nope" },
			makeContext(),
		);
		expect(appendResult.success).toBe(false);
		expect(appendResult.error).toMatch(/Failed to append/i);
	});

	it("declares encoding default and content as optional write/append field", () => {
		const declaration = tool.getDeclaration();
		expect(declaration.description).toContain("file system operations");
		expect(declaration.parameters?.properties?.encoding).toEqual(
			expect.objectContaining({
				type: expect.anything(),
				default: "utf8",
			}),
		);
		expect(declaration.parameters?.properties?.content?.description).toMatch(
			/write and append/i,
		);
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

	it("lists entry shape with isDirectory, size, path, and timestamps", async () => {
		await tool.runAsync(
			{ operation: "mkdir", filepath: "mixed" },
			makeContext(),
		);
		await tool.runAsync(
			{ operation: "write", filepath: "mixed/file.txt", content: "abc" },
			makeContext(),
		);
		await tool.runAsync(
			{ operation: "mkdir", filepath: "mixed/subdir" },
			makeContext(),
		);

		const listResult = await tool.runAsync(
			{ operation: "list", filepath: "mixed" },
			makeContext(),
		);

		expect(listResult.success).toBe(true);
		const fileEntry = listResult.data.find(
			(e: { name: string }) => e.name === "file.txt",
		);
		const dirEntry = listResult.data.find(
			(e: { name: string }) => e.name === "subdir",
		);

		expect(fileEntry).toEqual(
			expect.objectContaining({
				name: "file.txt",
				path: path.join(basePath, "mixed", "file.txt"),
				isFile: true,
				isDirectory: false,
				size: 3,
			}),
		);
		expect(fileEntry.created).toBeInstanceOf(Date);
		expect(fileEntry.modified).toBeInstanceOf(Date);

		expect(dirEntry).toEqual(
			expect.objectContaining({
				name: "subdir",
				path: path.join(basePath, "mixed", "subdir"),
				isFile: false,
				isDirectory: true,
			}),
		);
	});

	it("creates missing parent directories on nested write and append", async () => {
		const writeResult = await tool.runAsync(
			{
				operation: "write",
				filepath: "deep/nested/path/note.txt",
				content: "first",
			},
			makeContext(),
		);
		expect(writeResult.success).toBe(true);

		const appendResult = await tool.runAsync(
			{
				operation: "append",
				filepath: "deep/nested/path/note.txt",
				content: "-second",
			},
			makeContext(),
		);
		expect(appendResult.success).toBe(true);

		const readResult = await tool.runAsync(
			{ operation: "read", filepath: "deep/nested/path/note.txt" },
			makeContext(),
		);
		expect(readResult.data).toBe("first-second");
		const nestedStat = await fs.stat(
			path.join(basePath, "deep", "nested", "path"),
		);
		expect(nestedStat.isDirectory()).toBe(true);
	});

	it("treats basePath itself as an allowed list target", async () => {
		await tool.runAsync(
			{ operation: "write", filepath: "root.txt", content: "r" },
			makeContext(),
		);
		const listResult = await tool.runAsync(
			{ operation: "list", filepath: "." },
			makeContext(),
		);
		expect(listResult.success).toBe(true);
		expect(listResult.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "root.txt", isFile: true }),
			]),
		);
	});

	it("returns failure when listing a file path instead of a directory", async () => {
		await tool.runAsync(
			{ operation: "write", filepath: "not-a-dir.txt", content: "x" },
			makeContext(),
		);
		const result = await tool.runAsync(
			{ operation: "list", filepath: "not-a-dir.txt" },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/Failed to list directory/i);
	});

	it("returns failure when reading a directory path", async () => {
		await tool.runAsync(
			{ operation: "mkdir", filepath: "only-dir" },
			makeContext(),
		);
		const result = await tool.runAsync(
			{ operation: "read", filepath: "only-dir" },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/Failed to read file/i);
	});

	it("returns failure when deleting a missing nested path", async () => {
		const result = await tool.runAsync(
			{ operation: "delete", filepath: "gone/nested.txt" },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/Failed to delete file/i);
	});

	it("appends empty string when append content is omitted", async () => {
		await tool.runAsync(
			{ operation: "write", filepath: "a.txt", content: "base" },
			makeContext(),
		);
		const appendResult = await tool.runAsync(
			{ operation: "append", filepath: "a.txt" },
			makeContext(),
		);
		expect(appendResult.success).toBe(true);
		const readResult = await tool.runAsync(
			{ operation: "read", filepath: "a.txt" },
			makeContext(),
		);
		expect(readResult.data).toBe("base");
	});

	it("mkdir is idempotent for an existing directory", async () => {
		await expect(
			tool.runAsync({ operation: "mkdir", filepath: "idem" }, makeContext()),
		).resolves.toEqual({ success: true });
		await expect(
			tool.runAsync({ operation: "mkdir", filepath: "idem" }, makeContext()),
		).resolves.toEqual({ success: true });
	});

	it("stringifies non-Error throws from the outer operation catch", async () => {
		const badTool = new FileOperationsTool({ basePath });
		vi.spyOn(badTool as any, "validatePath").mockImplementation(() => {
			throw "denied-string";
		});

		const result = await badTool.runAsync(
			{ operation: "read", filepath: "x.txt" },
			makeContext(),
		);

		expect(result).toEqual({
			success: false,
			error: "denied-string",
		});
	});

	it("stringifies non-Error throws from per-op read/write/append/delete/list/mkdir catches", async () => {
		const ops = [
			{
				operation: "read" as const,
				filepath: "r.txt",
				spy: "readFile",
				prefix: /Failed to read file: read-fail/,
			},
			{
				operation: "write" as const,
				filepath: "w.txt",
				content: "x",
				spy: "writeFile",
				prefix: /Failed to write to file: write-fail/,
			},
			{
				operation: "append" as const,
				filepath: "a.txt",
				content: "x",
				spy: "appendFile",
				prefix: /Failed to append to file: append-fail/,
			},
			{
				operation: "delete" as const,
				filepath: "d.txt",
				spy: "unlink",
				prefix: /Failed to delete file: delete-fail/,
			},
			{
				operation: "list" as const,
				filepath: ".",
				spy: "readdir",
				prefix: /Failed to list directory: list-fail/,
			},
			{
				operation: "mkdir" as const,
				filepath: "m",
				spy: "mkdir",
				prefix: /Failed to create directory: mkdir-fail/,
			},
		];

		for (const op of ops) {
			const spy = vi
				.spyOn(fs, op.spy as keyof typeof fs)
				.mockRejectedValue(`${op.operation}-fail` as any);
			const result = await tool.runAsync(
				{
					operation: op.operation,
					filepath: op.filepath,
					...(op.content ? { content: op.content } : {}),
				},
				makeContext(),
			);
			expect(result.success).toBe(false);
			expect(result.error).toMatch(op.prefix);
			spy.mockRestore();
		}
	});

	it("exists still returns success:true data:false when access throws non-Error", async () => {
		const spy = vi.spyOn(fs, "access").mockRejectedValue("missing" as any);
		const result = await tool.runAsync(
			{ operation: "exists", filepath: "x.txt" },
			makeContext(),
		);
		expect(result).toEqual({ success: true, data: false });
		spy.mockRestore();
	});

	it("allows reading the basePath directory equality boundary via absolute path", async () => {
		const listResult = await tool.runAsync(
			{ operation: "list", filepath: basePath },
			makeContext(),
		);
		expect(listResult.success).toBe(true);
		expect(Array.isArray(listResult.data)).toBe(true);
	});
});
