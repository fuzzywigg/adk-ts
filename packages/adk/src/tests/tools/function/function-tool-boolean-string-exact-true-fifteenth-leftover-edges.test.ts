import { describe, expect, it } from "vitest";
import { FunctionTool } from "../../../tools/function/function-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

/**
 * Fifteenth leftover: boolean coerce is `value.toLowerCase() === "true"`
 * with no trim — whitespace / "1" / "on" / "yes" stay false.
 */
describe("function-tool boolean string exact-true fifteenth leftover", () => {
	it.each([
		" true",
		"true ",
		" true ",
		"1",
		"on",
		"yes",
		"Y",
		"t",
		"True\n",
	] as const)("string %j does not coerce to boolean true", async (input) => {
		function flags(a: boolean) {
			return { a };
		}
		const tool = new FunctionTool(flags, {
			description: "Exact true-only boolean coerce",
			parameterTypes: { a: "boolean" as any },
		});
		await expect(
			tool.runAsync({ a: input } as any, makeContext()),
		).resolves.toEqual({ a: false });
	});

	it.each([
		"true",
		"TRUE",
		"True",
	] as const)("bare %j still coerces to true (control)", async (input) => {
		function flags(a: boolean) {
			return { a };
		}
		const tool = new FunctionTool(flags, {
			description: "Bare true control",
			parameterTypes: { a: "boolean" as any },
		});
		await expect(
			tool.runAsync({ a: input } as any, makeContext()),
		).resolves.toEqual({ a: true });
	});
});
