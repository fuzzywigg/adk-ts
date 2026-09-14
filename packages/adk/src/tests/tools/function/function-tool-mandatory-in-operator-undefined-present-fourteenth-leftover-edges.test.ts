import { describe, expect, it } from "vitest";
import { FunctionTool } from "../../../tools/function/function-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

/**
 * Fourteenth leftover: getMissingMandatoryArgs uses `!(arg in args)` — key
 * present with undefined is not missing (unlike omitted key).
 */
describe("function-tool mandatory in-operator undefined-present fourteenth leftover", () => {
	it("mandatory x with { x: undefined } invokes fn (not missing-args envelope)", async () => {
		function greet(x: string) {
			return { x, kind: typeof x };
		}
		const tool = new FunctionTool(greet, {
			description: "Mandatory arg present as undefined",
		});
		await expect(
			tool.runAsync({ x: undefined } as any, makeContext()),
		).resolves.toEqual({ x: undefined, kind: "undefined" });
	});

	it("omitted mandatory x still yields missing-args envelope (control)", async () => {
		function greet(x: string) {
			return { x };
		}
		const tool = new FunctionTool(greet, {
			description: "Mandatory arg omitted control",
		});
		const result = await tool.runAsync({} as any, makeContext());
		expect(result.error).toContain("mandatory input parameters");
	});
});
