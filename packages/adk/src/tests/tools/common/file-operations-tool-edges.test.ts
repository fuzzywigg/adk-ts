import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileOperationsTool } from "../../../tools/common/file-operations-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("FileOperationsTool leftover edges", () => {
	let basePath: string;
	let tool: FileOperationsTool;

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-file-ops-edges-"));
		tool = new FileOperationsTool({ basePath });
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await fs.rm(basePath, { recursive: true, force: true });
	});

	it("stringifies non-Error rejections inside readFile", async () => {
		vi.spyOn(fs, "readFile").mockRejectedValueOnce("EIO-string");
		await expect(
			tool.runAsync({ operation: "read", filepath: "x.txt" }, makeContext()),
		).resolves.toEqual({
			success: false,
			error: "Failed to read file: EIO-string",
		});
	});

	it("stringifies object rejections inside writeFile", async () => {
		vi.spyOn(fs, "writeFile").mockRejectedValueOnce({ code: "EIO" });
		await expect(
			tool.runAsync(
				{ operation: "write", filepath: "x.txt", content: "hi" },
				makeContext(),
			),
		).resolves.toEqual({
			success: false,
			error: "Failed to write to file: [object Object]",
		});
	});

	it("stringifies non-Error rejections inside appendFile", async () => {
		vi.spyOn(fs, "appendFile").mockRejectedValueOnce(42);
		await expect(
			tool.runAsync(
				{ operation: "append", filepath: "x.txt", content: "more" },
				makeContext(),
			),
		).resolves.toEqual({
			success: false,
			error: "Failed to append to file: 42",
		});
	});

	it("stringifies non-Error rejections inside deleteFile", async () => {
		vi.spyOn(fs, "unlink").mockRejectedValueOnce("ENOENT-string");
		await expect(
			tool.runAsync({ operation: "delete", filepath: "x.txt" }, makeContext()),
		).resolves.toEqual({
			success: false,
			error: "Failed to delete file: ENOENT-string",
		});
	});

	it("stringifies non-Error rejections inside listDirectory", async () => {
		vi.spyOn(fs, "readdir").mockRejectedValueOnce({ reason: "boom" });
		await expect(
			tool.runAsync({ operation: "list", filepath: "." }, makeContext()),
		).resolves.toEqual({
			success: false,
			error: "Failed to list directory: [object Object]",
		});
	});

	it("stringifies non-Error rejections inside makeDirectory", async () => {
		vi.spyOn(fs, "mkdir").mockRejectedValueOnce("EPERM-string");
		await expect(
			tool.runAsync({ operation: "mkdir", filepath: "nested" }, makeContext()),
		).resolves.toEqual({
			success: false,
			error: "Failed to create directory: EPERM-string",
		});
	});

	it("defaults basePath to process.cwd when options omit it", () => {
		const cwdTool = new FileOperationsTool();
		expect((cwdTool as any).basePath).toBe(process.cwd());
	});

	it("defaults basePath to process.cwd when basePath is empty string", () => {
		const cwdTool = new FileOperationsTool({ basePath: "" });
		expect((cwdTool as any).basePath).toBe(process.cwd());
	});

	it("rejects path traversal outside the base path", async () => {
		await expect(
			tool.runAsync(
				{ operation: "read", filepath: "../outside.txt" },
				makeContext(),
			),
		).resolves.toMatchObject({ success: false });
	});

	it("rejects absolute paths that escape the base path", async () => {
		await expect(
			tool.runAsync(
				{ operation: "read", filepath: "/etc/passwd" },
				makeContext(),
			),
		).resolves.toMatchObject({ success: false });
	});

	it("uses utf8 when encoding is omitted for write and read", async () => {
		await expect(
			tool.runAsync(
				{ operation: "write", filepath: "plain.txt", content: "αβγ" },
				makeContext(),
			),
		).resolves.toEqual({ success: true });

		await expect(
			tool.runAsync(
				{ operation: "read", filepath: "plain.txt" },
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: "αβγ" });
	});

	it("honors explicit encoding for write and read round-trips", async () => {
		await expect(
			tool.runAsync(
				{
					operation: "write",
					filepath: "latin1.txt",
					content: "café",
					encoding: "latin1",
				},
				makeContext(),
			),
		).resolves.toEqual({ success: true });

		await expect(
			tool.runAsync(
				{ operation: "read", filepath: "latin1.txt", encoding: "latin1" },
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: "café" });
	});

	it("list includes directories with isDirectory true", async () => {
		await tool.runAsync(
			{ operation: "mkdir", filepath: "subdir" },
			makeContext(),
		);
		await tool.runAsync(
			{ operation: "write", filepath: "subdir/a.txt", content: "a" },
			makeContext(),
		);

		const listed = await tool.runAsync(
			{ operation: "list", filepath: "." },
			makeContext(),
		);
		expect(listed.success).toBe(true);
		expect(listed.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "subdir", isDirectory: true }),
			]),
		);
	});

	it("write creates nested directories before writing", async () => {
		await expect(
			tool.runAsync(
				{
					operation: "write",
					filepath: "deep/nested/file.txt",
					content: "nested",
				},
				makeContext(),
			),
		).resolves.toEqual({ success: true });

		await expect(
			tool.runAsync(
				{ operation: "read", filepath: "deep/nested/file.txt" },
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: "nested" });
	});

	it("append creates nested directories when the file does not exist yet", async () => {
		await expect(
			tool.runAsync(
				{
					operation: "append",
					filepath: "new/dir/log.txt",
					content: "line1",
				},
				makeContext(),
			),
		).resolves.toEqual({ success: true });

		await expect(
			tool.runAsync(
				{ operation: "read", filepath: "new/dir/log.txt" },
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: "line1" });
	});

	it("unknown operation surfaces a failure envelope", async () => {
		await expect(
			tool.runAsync(
				{ operation: "chmod" as any, filepath: "x.txt" },
				makeContext(),
			),
		).resolves.toMatchObject({ success: false });
	});

	it("write without content still succeeds with undefined content", async () => {
		await expect(
			tool.runAsync(
				{ operation: "write", filepath: "emptyish.txt" } as any,
				makeContext(),
			),
		).resolves.toEqual({ success: true });
	});

	it("exists returns false for a deleted path after a successful delete", async () => {
		await tool.runAsync(
			{ operation: "write", filepath: "tmp.txt", content: "x" },
			makeContext(),
		);
		await tool.runAsync(
			{ operation: "delete", filepath: "tmp.txt" },
			makeContext(),
		);
		await expect(
			tool.runAsync(
				{ operation: "exists", filepath: "tmp.txt" },
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: false });
	});
});
