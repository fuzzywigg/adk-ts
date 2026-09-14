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
 * Eleventh leftover: validatePath requires startsWith(base + sep), not
 * startsWith(base). A sibling path that shares the base prefix without a
 * separator is denied.
 */
describe("FileOperationsTool sibling prefix + sep eleventh leftover", () => {
	let basePath: string;
	let siblingPath: string;
	let tool: FileOperationsTool;

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-file-11th-"));
		siblingPath = `${basePath}-sibling`;
		await fs.mkdir(siblingPath, { recursive: true });
		tool = new FileOperationsTool({ basePath });
	});

	afterEach(async () => {
		await fs.rm(basePath, { recursive: true, force: true });
		await fs.rm(siblingPath, { recursive: true, force: true });
	});

	it("denies a sibling path that starts with basePath but not basePath+sep", async () => {
		expect(siblingPath.startsWith(basePath)).toBe(true);
		expect(siblingPath.startsWith(`${basePath}${path.sep}`)).toBe(false);
		await expect(
			tool.runAsync(
				{ operation: "exists", filepath: siblingPath },
				makeContext(),
			),
		).resolves.toEqual({
			success: false,
			error: "Access denied: Can't access paths outside the base directory",
		});
	});

	it("allows a nested path under basePath+sep", async () => {
		const nested = path.join(basePath, "child.txt");
		await expect(
			tool.runAsync(
				{ operation: "write", filepath: nested, content: "ok" },
				makeContext(),
			),
		).resolves.toEqual({ success: true });
		await expect(
			tool.runAsync({ operation: "read", filepath: nested }, makeContext()),
		).resolves.toEqual({ success: true, data: "ok" });
	});
});
