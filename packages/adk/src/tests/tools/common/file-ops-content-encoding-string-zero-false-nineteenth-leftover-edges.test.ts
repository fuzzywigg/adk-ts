import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileOperationsTool } from "../../../tools/common/file-operations-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

/**
 * Nineteenth leftover: `encoding || "utf8"` and `content || ""` — string
 * "0"/"false" are truthy and forwarded (sixth already pins falsy encoding → utf8).
 */
describe("file-ops content/encoding string-zero/false nineteenth leftover", () => {
	let basePath: string;
	let tool: FileOperationsTool;

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-file-19th-"));
		tool = new FileOperationsTool({ basePath });
	});

	afterEach(async () => {
		await fs.rm(basePath, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it.each([
		"0",
		"false",
	] as const)("encoding: %j forwarded via || (not coalesced to utf8; Node may reject)", async (encoding) => {
		const writeSpy = vi
			.spyOn(fs, "writeFile")
			.mockResolvedValue(undefined as any);
		await expect(
			tool.runAsync(
				{
					operation: "write",
					filepath: `enc-${encoding}.txt`,
					content: "payload",
					encoding: encoding as any,
				},
				makeContext(),
			),
		).resolves.toMatchObject({ success: true });
		expect(writeSpy).toHaveBeenCalledWith(expect.any(String), "payload", {
			encoding,
		});
	});

	it.each([
		"0",
		"false",
	] as const)('content: %j kept on write via content || ""', async (content) => {
		const writeSpy = vi.spyOn(fs, "writeFile");
		await expect(
			tool.runAsync(
				{
					operation: "write",
					filepath: `content-${content}.txt`,
					content: content as any,
				},
				makeContext(),
			),
		).resolves.toMatchObject({ success: true });
		expect(writeSpy).toHaveBeenCalledWith(
			expect.any(String),
			content,
			expect.objectContaining({ encoding: "utf8" }),
		);
	});

	it("falsy content still coalesces to empty string (control)", async () => {
		const writeSpy = vi.spyOn(fs, "writeFile");
		await tool.runAsync(
			{
				operation: "write",
				filepath: "content-falsy.txt",
				content: 0 as any,
			},
			makeContext(),
		);
		expect(writeSpy).toHaveBeenCalledWith(
			expect.any(String),
			"",
			expect.objectContaining({ encoding: "utf8" }),
		);
	});
});
