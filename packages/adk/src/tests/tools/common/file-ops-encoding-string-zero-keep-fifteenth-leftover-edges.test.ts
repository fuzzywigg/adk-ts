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
 * Fifteenth leftover: `encoding || "utf8"` — string "0" is truthy and kept
 * (unlike numeric 0 which sixth leftover coalesces).
 */
describe("file-ops encoding string-zero keep fifteenth leftover", () => {
	let basePath: string;
	let tool: FileOperationsTool;

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-file-15th-enc-"));
		tool = new FileOperationsTool({ basePath });
	});

	afterEach(async () => {
		await fs.rm(basePath, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it('encoding: "0" is truthy and forwarded to writeFile', async () => {
		const writeSpy = vi.spyOn(fs, "writeFile");
		await expect(
			tool.runAsync(
				{
					operation: "write",
					filepath: "zero-enc.txt",
					content: "payload",
					encoding: "0" as any,
				},
				makeContext(),
			),
		).resolves.toMatchObject({ success: false });
		expect(writeSpy).toHaveBeenCalledWith(expect.any(String), "payload", {
			encoding: "0",
		});
	});

	it("numeric encoding: 0 still coalesces to utf8 (control)", async () => {
		const writeSpy = vi.spyOn(fs, "writeFile");
		await expect(
			tool.runAsync(
				{
					operation: "write",
					filepath: "num-zero-enc.txt",
					content: "payload",
					encoding: 0 as any,
				},
				makeContext(),
			),
		).resolves.toMatchObject({ success: true });
		expect(writeSpy).toHaveBeenCalledWith(expect.any(String), "payload", {
			encoding: "utf8",
		});
	});
});
