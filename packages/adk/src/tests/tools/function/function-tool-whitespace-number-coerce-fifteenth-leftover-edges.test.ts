import { describe, expect, it } from "vitest";
import { FunctionTool } from "../../../tools/function/function-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

/**
 * Fifteenth leftover: number coercion uses `!Number.isNaN(Number(value))` —
 * whitespace strings coerce to 0 (Number(" ") === 0). Distinct from empty
 * string fifth leftover.
 */
describe("function-tool whitespace number coerce fifteenth leftover", () => {
	it.each([
		{ label: "single space", value: " " },
		{ label: "double space", value: "  " },
		{ label: "tab", value: "\t" },
		{ label: "newline", value: "\n" },
	] as const)("coerces whitespace $label to number 0", async ({ value }) => {
		function nums(a: number) {
			return { a, type: typeof a };
		}
		const tool = new FunctionTool(nums, {
			description: "Whitespace number coercion leftover",
			parameterTypes: { a: "number" as any },
		});
		await expect(
			tool.runAsync({ a: value } as any, makeContext()),
		).resolves.toEqual({ a: 0, type: "number" });
	});

	it("non-numeric string still left unchanged (control)", async () => {
		function nums(a: number) {
			return { a };
		}
		const tool = new FunctionTool(nums, {
			description: "Non-numeric string stays",
			parameterTypes: { a: "number" as any },
		});
		await expect(
			tool.runAsync({ a: "abc" } as any, makeContext()),
		).resolves.toEqual({ a: "abc" });
	});
});
