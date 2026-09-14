import { describe, expect, it } from "vitest";
import { createTool } from "../../../tools/base/create-tool";
import { FunctionTool } from "../../../tools/function/function-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

/**
 * Thirteenth leftover: createTool returns `result ?? {}` (keeps 0/false/"")
 * while FunctionTool uses `result || {}` (collapses those to {}).
 */
describe("createTool vs FunctionTool falsy-return thirteenth leftover", () => {
	it.each([
		0,
		false,
		"",
	] as const)("createTool keeps falsy %j via ??", async (value) => {
		const tool = createTool({
			name: `keep_${String(value)}`,
			description: "createTool nullish-only coalesce leftover",
			fn: () => value as any,
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toBe(value);
	});

	it.each([
		null,
		undefined,
	] as const)("createTool coalesces nullish %j to {}", async (value) => {
		const tool = createTool({
			name: `nullish_${String(value)}`,
			description: "createTool nullish coalesce leftover",
			fn: () => value as any,
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({});
	});

	it.each([
		0,
		false,
		"",
	] as const)("FunctionTool still coalesces %j to {} via ||", async (value) => {
		const fn = () => value as any;
		Object.defineProperty(fn, "name", { value: `fn_${String(value)}` });
		const tool = new FunctionTool(fn, {
			description: "FunctionTool or-empty leftover",
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({});
	});
});
