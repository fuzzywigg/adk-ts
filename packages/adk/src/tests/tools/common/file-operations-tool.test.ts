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

	it("declares the full operation enum and encoding default", () => {
		const declaration = tool.getDeclaration();
		expect(declaration.description).toContain("file system operations");
		expect(declaration.parameters?.properties?.operation?.enum).toEqual([
			"read",
			"write",
			"append",
			"delete",
			"exists",
			"list",
			"mkdir",
		]);
		expect(declaration.parameters?.properties?.encoding?.default).toBe("utf8");
		expect(declaration.parameters?.properties?.content?.type).toBeTruthy();
		expect(declaration.parameters?.required).toEqual(["operation", "filepath"]);
	});

	it("allows reading the base directory itself via relative '.' ", async () => {
		await tool.runAsync(
			{ operation: "write", filepath: "root-file.txt", content: "r" },
			makeContext(),
		);
		const listResult = await tool.runAsync(
			{ operation: "list", filepath: "." },
			makeContext(),
		);
		expect(listResult.success).toBe(true);
		expect(listResult.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "root-file.txt", isFile: true }),
			]),
		);
	});

	it("lists mixed files and directories with metadata fields", async () => {
		await tool.runAsync(
			{ operation: "mkdir", filepath: "mixed/sub" },
			makeContext(),
		);
		await tool.runAsync(
			{ operation: "write", filepath: "mixed/file.txt", content: "abc" },
			makeContext(),
		);

		const listResult = await tool.runAsync(
			{ operation: "list", filepath: "mixed" },
			makeContext(),
		);

		expect(listResult.success).toBe(true);
		const entries = listResult.data as Array<Record<string, unknown>>;
		expect(entries.length).toBeGreaterThanOrEqual(2);

		const fileEntry = entries.find((e) => e.name === "file.txt");
		const dirEntry = entries.find((e) => e.name === "sub");

		expect(fileEntry).toEqual(
			expect.objectContaining({
				name: "file.txt",
				isFile: true,
				isDirectory: false,
				size: 3,
			}),
		);
		expect(fileEntry?.path).toBe(path.join(basePath, "mixed", "file.txt"));
		expect(fileEntry?.created).toBeInstanceOf(Date);
		expect(fileEntry?.modified).toBeInstanceOf(Date);

		expect(dirEntry).toEqual(
			expect.objectContaining({
				name: "sub",
				isFile: false,
				isDirectory: true,
			}),
		);
	});

	it("auto-creates parent directories on write and append", async () => {
		const writeResult = await tool.runAsync(
			{
				operation: "write",
				filepath: "deep/nested/new.txt",
				content: "nested",
			},
			makeContext(),
		);
		expect(writeResult.success).toBe(true);

		const readResult = await tool.runAsync(
			{ operation: "read", filepath: "deep/nested/new.txt" },
			makeContext(),
		);
		expect(readResult.data).toBe("nested");

		const appendResult = await tool.runAsync(
			{
				operation: "append",
				filepath: "deep/other/path.txt",
				content: "appended",
			},
			makeContext(),
		);
		expect(appendResult.success).toBe(true);
		const reread = await tool.runAsync(
			{ operation: "read", filepath: "deep/other/path.txt" },
			makeContext(),
		);
		expect(reread.data).toBe("appended");
	});

	it("normalizes path segments that stay inside the sandbox", async () => {
		await tool.runAsync(
			{ operation: "write", filepath: "safe/inside.txt", content: "ok" },
			makeContext(),
		);

		const result = await tool.runAsync(
			{ operation: "read", filepath: "safe/../safe/inside.txt" },
			makeContext(),
		);
		expect(result).toEqual({ success: true, data: "ok" });
	});

	it("returns Failed to read file prefix for missing files", async () => {
		const result = await tool.runAsync(
			{ operation: "read", filepath: "nope.txt" },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/^Failed to read file:/);
	});

	it("returns Failed to delete file prefix for missing files", async () => {
		const result = await tool.runAsync(
			{ operation: "delete", filepath: "nope.txt" },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/^Failed to delete file:/);
	});

	it("mkdir is idempotent for existing directories", async () => {
		await expect(
			tool.runAsync({ operation: "mkdir", filepath: "idem" }, makeContext()),
		).resolves.toEqual({ success: true });
		await expect(
			tool.runAsync({ operation: "mkdir", filepath: "idem" }, makeContext()),
		).resolves.toEqual({ success: true });
	});

	it("exists returns true for directories created via mkdir", async () => {
		await tool.runAsync(
			{ operation: "mkdir", filepath: "exists-dir" },
			makeContext(),
		);
		await expect(
			tool.runAsync(
				{ operation: "exists", filepath: "exists-dir" },
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: true });
	});

	it("rejects path traversal with nested .. segments", async () => {
		const result = await tool.runAsync(
			{ operation: "list", filepath: "a/../../outside" },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Access denied");
	});

	it("writes and reads unicode content", async () => {
		const content = "你好 🎉 café";
		await tool.runAsync(
			{ operation: "write", filepath: "unicode.txt", content },
			makeContext(),
		);
		const readResult = await tool.runAsync(
			{ operation: "read", filepath: "unicode.txt" },
			makeContext(),
		);
		expect(readResult).toEqual({ success: true, data: content });
	});

	it("overwrites existing files on write", async () => {
		await tool.runAsync(
			{ operation: "write", filepath: "ow.txt", content: "old" },
			makeContext(),
		);
		await tool.runAsync(
			{ operation: "write", filepath: "ow.txt", content: "new" },
			makeContext(),
		);
		const readResult = await tool.runAsync(
			{ operation: "read", filepath: "ow.txt" },
			makeContext(),
		);
		expect(readResult.data).toBe("new");
	});

	it("appends empty string when content is omitted", async () => {
		await tool.runAsync(
			{ operation: "write", filepath: "append-omit.txt", content: "keep" },
			makeContext(),
		);

		const appendResult = await tool.runAsync(
			{ operation: "append", filepath: "append-omit.txt" },
			makeContext(),
		);
		expect(appendResult.success).toBe(true);

		const readResult = await tool.runAsync(
			{ operation: "read", filepath: "append-omit.txt" },
			makeContext(),
		);
		expect(readResult).toEqual({ success: true, data: "keep" });
	});

	it("creates a file with empty content when append omits content on a new path", async () => {
		const appendResult = await tool.runAsync(
			{ operation: "append", filepath: "new-append.txt" },
			makeContext(),
		);
		expect(appendResult.success).toBe(true);

		const readResult = await tool.runAsync(
			{ operation: "read", filepath: "new-append.txt" },
			makeContext(),
		);
		expect(readResult).toEqual({ success: true, data: "" });
	});

	it("lists an empty directory as an empty array", async () => {
		await tool.runAsync(
			{ operation: "mkdir", filepath: "empty-dir" },
			makeContext(),
		);

		const listResult = await tool.runAsync(
			{ operation: "list", filepath: "empty-dir" },
			makeContext(),
		);
		expect(listResult).toEqual({ success: true, data: [] });
	});

	it("writes and reads with base64 and utf16le encodings", async () => {
		const plain = "encode-me";
		const base64Content = Buffer.from(plain, "utf8").toString("base64");

		const base64Write = await tool.runAsync(
			{
				operation: "write",
				filepath: "enc-b64.txt",
				content: base64Content,
				encoding: "base64",
			},
			makeContext(),
		);
		expect(base64Write.success).toBe(true);

		const base64Read = await tool.runAsync(
			{ operation: "read", filepath: "enc-b64.txt", encoding: "base64" },
			makeContext(),
		);
		expect(base64Read.success).toBe(true);
		expect(
			Buffer.from(base64Read.data as string, "base64").toString("utf8"),
		).toBe(plain);

		const utf16Write = await tool.runAsync(
			{
				operation: "write",
				filepath: "enc-utf16.txt",
				content: plain,
				encoding: "utf16le",
			},
			makeContext(),
		);
		expect(utf16Write.success).toBe(true);

		const utf16Read = await tool.runAsync(
			{ operation: "read", filepath: "enc-utf16.txt", encoding: "utf16le" },
			makeContext(),
		);
		expect(utf16Read).toEqual({ success: true, data: plain });
	});

	it("stringifies non-Error rejections from fs operations", async () => {
		await tool.runAsync(
			{ operation: "write", filepath: "seed.txt", content: "seed" },
			makeContext(),
		);
		await tool.runAsync(
			{ operation: "mkdir", filepath: "seed-dir" },
			makeContext(),
		);

		vi.spyOn(fs, "readFile").mockRejectedValueOnce("boom-string");
		await expect(
			tool.runAsync({ operation: "read", filepath: "seed.txt" }, makeContext()),
		).resolves.toEqual({
			success: false,
			error: "Failed to read file: boom-string",
		});

		vi.spyOn(fs, "writeFile").mockRejectedValueOnce("boom-string");
		await expect(
			tool.runAsync(
				{ operation: "write", filepath: "seed.txt", content: "x" },
				makeContext(),
			),
		).resolves.toEqual({
			success: false,
			error: "Failed to write to file: boom-string",
		});

		vi.spyOn(fs, "appendFile").mockRejectedValueOnce("boom-string");
		await expect(
			tool.runAsync(
				{ operation: "append", filepath: "seed.txt", content: "x" },
				makeContext(),
			),
		).resolves.toEqual({
			success: false,
			error: "Failed to append to file: boom-string",
		});

		vi.spyOn(fs, "unlink").mockRejectedValueOnce("boom-string");
		await expect(
			tool.runAsync(
				{ operation: "delete", filepath: "seed.txt" },
				makeContext(),
			),
		).resolves.toEqual({
			success: false,
			error: "Failed to delete file: boom-string",
		});

		vi.spyOn(fs, "readdir").mockRejectedValueOnce("boom-string");
		await expect(
			tool.runAsync({ operation: "list", filepath: "seed-dir" }, makeContext()),
		).resolves.toEqual({
			success: false,
			error: "Failed to list directory: boom-string",
		});

		vi.spyOn(fs, "mkdir").mockRejectedValueOnce("boom-string");
		await expect(
			tool.runAsync(
				{ operation: "mkdir", filepath: "new-fail-dir" },
				makeContext(),
			),
		).resolves.toEqual({
			success: false,
			error: "Failed to create directory: boom-string",
		});
	});

	it("stringifies non-Error throws from the outer catch path", async () => {
		const normalizeSpy = vi
			.spyOn(path, "normalize")
			.mockImplementationOnce(() => {
				throw "normalize-fail";
			});

		const result = await tool.runAsync(
			{ operation: "exists", filepath: "any.txt" },
			makeContext(),
		);

		expect(result).toEqual({
			success: false,
			error: "normalize-fail",
		});
		normalizeSpy.mockRestore();
	});
});
