import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileOperationsTool } from "../../../tools/common/file-operations-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

/**
 * Fourteenth leftover: switch (args.operation) is exact case — "READ"/"Write"
 * hit default Unsupported operation.
 */
describe("file-ops operation case-sensitivity fourteenth leftover", () => {
	let basePath: string;
	let tool: FileOperationsTool;

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-file-14th-"));
		tool = new FileOperationsTool({ basePath });
	});

	afterEach(async () => {
		await fs.rm(basePath, { recursive: true, force: true });
	});

	it.each([
		"READ",
		"Write",
		"EXISTS",
		"List",
		"Mkdir",
	] as const)("operation %j is unsupported (case-sensitive switch)", async (operation) => {
		const result = await tool.runAsync(
			{ operation: operation as any, filepath: "." },
			makeContext(),
		);
		expect(result.success).toBe(false);
		expect(result.error).toBe(`Unsupported operation: ${operation}`);
	});

	it('lowercase "exists" still works (control)', async () => {
		const result = await tool.runAsync(
			{ operation: "exists", filepath: "." },
			makeContext(),
		);
		expect(result.success).toBe(true);
	});
});
