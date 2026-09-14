import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileOperationsTool } from "../../../tools/common/file-operations-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("FileOperationsTool encoding || utf8 sixth leftover edges (post #151)", () => {
	let basePath: string;
	let tool: FileOperationsTool;

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-file-6th-enc-"));
		tool = new FileOperationsTool({ basePath });
	});

	afterEach(async () => {
		await fs.rm(basePath, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "undefined", encoding: undefined },
		{ label: "null", encoding: null },
		{ label: "empty-string", encoding: "" },
		{ label: "0", encoding: 0 },
		{ label: "false", encoding: false },
	] as const)("coalesces falsy encoding ($label) to utf8 on write+read", async ({
		encoding,
	}) => {
		const writeSpy = vi.spyOn(fs, "writeFile");
		const readSpy = vi.spyOn(fs, "readFile");

		await expect(
			tool.runAsync(
				{
					operation: "write",
					filepath: `enc-${labelSafe(encoding)}.txt`,
					content: "payload",
					encoding: encoding as any,
				},
				makeContext(),
			),
		).resolves.toMatchObject({ success: true });

		expect(writeSpy).toHaveBeenCalledWith(expect.any(String), "payload", {
			encoding: "utf8",
		});

		await expect(
			tool.runAsync(
				{
					operation: "read",
					filepath: `enc-${labelSafe(encoding)}.txt`,
					encoding: encoding as any,
				},
				makeContext(),
			),
		).resolves.toEqual({ success: true, data: "payload" });

		expect(readSpy).toHaveBeenCalledWith(expect.any(String), {
			encoding: "utf8",
		});
	});

	it.each([
		{ label: "undefined", encoding: undefined },
		{ label: "null", encoding: null },
		{ label: "empty-string", encoding: "" },
	] as const)("coalesces falsy encoding ($label) to utf8 on append", async ({
		encoding,
	}) => {
		const appendSpy = vi.spyOn(fs, "appendFile");
		await tool.runAsync(
			{
				operation: "write",
				filepath: "append-target.txt",
				content: "base",
			},
			makeContext(),
		);
		await expect(
			tool.runAsync(
				{
					operation: "append",
					filepath: "append-target.txt",
					content: "+",
					encoding: encoding as any,
				},
				makeContext(),
			),
		).resolves.toMatchObject({ success: true });
		expect(appendSpy).toHaveBeenCalledWith(expect.any(String), "+", {
			encoding: "utf8",
		});
	});

	it("keeps explicit latin1 encoding (truthy) without coalescing", async () => {
		const writeSpy = vi.spyOn(fs, "writeFile");
		await tool.runAsync(
			{
				operation: "write",
				filepath: "latin1.txt",
				content: "abc",
				encoding: "latin1",
			},
			makeContext(),
		);
		expect(writeSpy).toHaveBeenCalledWith(expect.any(String), "abc", {
			encoding: "latin1",
		});
	});

	it("unsupported operation still stringifies via outer catch", async () => {
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
});

function labelSafe(encoding: unknown): string {
	if (encoding === "") return "empty";
	if (encoding === null) return "null";
	if (encoding === undefined) return "undef";
	return String(encoding);
}
