import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileOperationsTool } from "../../../tools/common/file-operations-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("FileOperationsTool fifth leftover — empty basePath / encoding|| / content|| / equality arm", () => {
	let basePath: string;
	let tool: FileOperationsTool;

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-file-5th-"));
		tool = new FileOperationsTool({ basePath });
	});

	afterEach(async () => {
		await fs.rm(basePath, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it("basePath empty string falls through || to process.cwd()", () => {
		const cwdTool = new FileOperationsTool({ basePath: "" });
		expect((cwdTool as any).basePath).toBe(process.cwd());
	});

	const falsyBasePaths = [null, undefined, false, 0] as const;
	for (const [i, base] of falsyBasePaths.entries()) {
		it(`falsy basePath #${i} coalesces to cwd`, () => {
			const cwdTool = new FileOperationsTool({ basePath: base as any });
			expect((cwdTool as any).basePath).toBe(process.cwd());
		});
	}

	const encodingFalsy: Array<{ label: string; encoding: any }> = [
		{ label: "empty string", encoding: "" },
		{ label: "null", encoding: null },
		{ label: "false", encoding: false },
		{ label: "0", encoding: 0 },
	];

	for (const { label, encoding } of encodingFalsy) {
		it(`encoding || "utf8" when ${label}`, async () => {
			await tool.runAsync(
				{
					operation: "write",
					filepath: `enc-${label.replace(/\s+/g, "-")}.txt`,
					content: "payload",
					encoding: "utf8",
				},
				makeContext(),
			);
			const result = await tool.runAsync(
				{
					operation: "read",
					filepath: `enc-${label.replace(/\s+/g, "-")}.txt`,
					encoding,
				},
				makeContext(),
			);
			expect(result).toEqual({ success: true, data: "payload" });
		});
	}

	const contentFalsy: Array<{ label: string; content: any }> = [
		{ label: "null", content: null },
		{ label: "false", content: false },
		{ label: "0", content: 0 },
	];

	for (const { label, content } of contentFalsy) {
		it(`write content || "" when ${label}`, async () => {
			const filepath = `content-${label}.txt`;
			await expect(
				tool.runAsync({ operation: "write", filepath, content }, makeContext()),
			).resolves.toEqual({ success: true });
			await expect(
				tool.runAsync({ operation: "read", filepath }, makeContext()),
			).resolves.toEqual({ success: true, data: "" });
		});
	}

	for (const { label, content } of contentFalsy) {
		it(`append content || "" when ${label}`, async () => {
			const filepath = `append-${label}.txt`;
			await tool.runAsync(
				{ operation: "write", filepath, content: "keep" },
				makeContext(),
			);
			await expect(
				tool.runAsync(
					{ operation: "append", filepath, content },
					makeContext(),
				),
			).resolves.toEqual({ success: true });
			await expect(
				tool.runAsync({ operation: "read", filepath }, makeContext()),
			).resolves.toEqual({ success: true, data: "keep" });
		});
	}

	it("validatePath equality arm allows filepath exactly equal to basePath", async () => {
		await expect(
			tool.runAsync({ operation: "list", filepath: basePath }, makeContext()),
		).resolves.toMatchObject({ success: true });
	});

	it("validatePath equality arm allows filepath with trailing-normalized basePath", async () => {
		const withSep = `${basePath}${path.sep}`;
		const result = await tool.runAsync(
			{ operation: "list", filepath: withSep },
			makeContext(),
		);
		expect(result.success).toBe(true);
	});

	it("outer catch stringifies non-Error thrown from resolvePath", async () => {
		const bad = new FileOperationsTool({ basePath });
		vi.spyOn(path, "isAbsolute").mockImplementation(() => {
			throw "path-boom";
		});
		await expect(
			bad.runAsync({ operation: "exists", filepath: "x.txt" }, makeContext()),
		).resolves.toEqual({
			success: false,
			error: "path-boom",
		});
	});

	it("unsupported operation reaches default throw → outer catch", async () => {
		await expect(
			tool.runAsync(
				{ operation: "chmod" as any, filepath: "x.txt" },
				makeContext(),
			),
		).resolves.toEqual({
			success: false,
			error: "Unsupported operation: chmod",
		});
	});

	it("absolute path outside basePath is denied", async () => {
		const outside = path.join(os.tmpdir(), "adk-outside-5th-deny");
		await expect(
			tool.runAsync({ operation: "exists", filepath: outside }, makeContext()),
		).resolves.toEqual({
			success: false,
			error: "Access denied: Can't access paths outside the base directory",
		});
	});
});
