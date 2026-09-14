import { describe, expect, it } from "vitest";
import { createTool } from "../../../tools/base/create-tool";
import { FunctionTool } from "../../../tools/function/function-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

/**
 * Fifteenth leftover: createTool `result ?? {}` keeps NaN; FunctionTool
 * `result || {}` collapses NaN (falsy). Fifth covered createTool NaN keep;
 * thirteenth compared 0/false/"" only.
 */
describe("createTool vs FunctionTool NaN return fifteenth leftover", () => {
	it("createTool keeps NaN via ??", async () => {
		const tool = createTool({
			name: "keep_nan",
			description: "createTool nullish-only keeps NaN",
			fn: () => Number.NaN as any,
		});
		const result = await tool.runAsync({}, makeContext());
		expect(Number.isNaN(result as number)).toBe(true);
	});

	it("FunctionTool coalesces NaN to {} via ||", async () => {
		function nanFn() {
			return Number.NaN as any;
		}
		Object.defineProperty(nanFn, "name", { value: "nan_fn" });
		const tool = new FunctionTool(nanFn, {
			description: "FunctionTool or-empty collapses NaN",
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({});
	});
});
