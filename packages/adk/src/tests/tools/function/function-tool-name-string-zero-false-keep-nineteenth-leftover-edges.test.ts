import { describe, expect, it } from "vitest";
import { FunctionTool } from "../../../tools/function/function-tool";

/**
 * Nineteenth leftover: `options?.name || func.name` — string "0"/"false" are
 * truthy and pass BaseTool charset (unlike "" which fifth leftover falls through).
 */
describe("function-tool name string-zero/false keep nineteenth leftover", () => {
	it.each([
		"0",
		"false",
	] as const)("options.name %j kept as tool name (charset OK)", (value) => {
		function named_fn() {
			return { ok: true };
		}
		const tool = new FunctionTool(named_fn, {
			name: value,
			description: "String truthy name override keep",
		});
		expect(tool.name).toBe(value);
	});

	it("empty options.name still falls through to func.name (fifth control)", () => {
		function named_fn() {
			return { ok: true };
		}
		const tool = new FunctionTool(named_fn, {
			name: "",
			description: "Empty name fallthrough control for nineteenth",
		});
		expect(tool.name).toBe("named_fn");
	});
});
