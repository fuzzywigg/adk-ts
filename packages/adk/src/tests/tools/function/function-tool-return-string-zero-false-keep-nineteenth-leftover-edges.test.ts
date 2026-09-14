import { describe, expect, it } from "vitest";
import { FunctionTool } from "../../../tools/function/function-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

/**
 * Nineteenth leftover: FunctionTool returns `result || {}` — string "0"/"false"
 * are truthy and kept (fifth/thirteenth already pin 0/false/"" → {}).
 */
describe("function-tool return string-zero/false keep nineteenth leftover", () => {
	it.each([
		"0",
		"false",
	] as const)('sync return %j kept via || {} (unlike 0/false/"")', async (value) => {
		const fn = () => value as any;
		Object.defineProperty(fn, "name", { value: `sync_${value}` });
		const tool = new FunctionTool(fn, {
			description: "String truthy sync return keep",
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toBe(value);
	});

	it.each([
		"0",
		"false",
	] as const)("async return %j kept via || {}", async (value) => {
		const fn = async () => value as any;
		Object.defineProperty(fn, "name", { value: `async_${value}` });
		const tool = new FunctionTool(fn, {
			description: "String truthy async return keep",
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toBe(value);
	});

	it("falsy numeric 0 still coalesces to {} (control)", async () => {
		const fn = () => 0 as any;
		Object.defineProperty(fn, "name", { value: "sync_num_zero" });
		const tool = new FunctionTool(fn, {
			description: "Numeric zero return control for nineteenth",
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({});
	});
});
