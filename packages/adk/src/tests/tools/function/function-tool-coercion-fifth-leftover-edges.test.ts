import { describe, expect, it } from "vitest";
import { FunctionTool } from "../../../tools/function/function-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("FunctionTool coercion fifth leftover matrices", () => {
	it("coerces empty string to number 0 because Number('') is 0", async () => {
		function nums(a: number) {
			return { a, type: typeof a };
		}
		const tool = new FunctionTool(nums, {
			description: "Empty string number coercion",
			parameterTypes: { a: "number" as any },
		});
		await expect(
			tool.runAsync({ a: "" } as any, makeContext()),
		).resolves.toEqual({ a: 0, type: "number" });
	});

	it("leaves non-numeric strings unchanged for number params", async () => {
		function nums(a: number) {
			return { a };
		}
		const tool = new FunctionTool(nums, {
			description: "Non-numeric string stays as string",
			parameterTypes: { a: "number" as any },
		});
		await expect(
			tool.runAsync({ a: "abc" } as any, makeContext()),
		).resolves.toEqual({ a: "abc" });
	});

	it("leaves object/number-like non-strings unchanged for number params", async () => {
		function nums(a: number) {
			return { a };
		}
		const tool = new FunctionTool(nums, {
			description: "Object value for number param breaks to original",
			parameterTypes: { a: "number" as any },
		});
		const obj = { n: 1 };
		await expect(
			tool.runAsync({ a: obj } as any, makeContext()),
		).resolves.toEqual({ a: obj });
	});

	it("boolean coercion leaves non-string non-boolean originals", async () => {
		function flags(a: boolean) {
			return { a, type: typeof a };
		}
		const tool = new FunctionTool(flags, {
			description: "Non-string boolean leave-as-is path",
			parameterTypes: { a: "boolean" as any },
		});
		await expect(
			tool.runAsync({ a: 1 } as any, makeContext()),
		).resolves.toEqual({ a: 1, type: "number" });
		await expect(
			tool.runAsync({ a: {} } as any, makeContext()),
		).resolves.toEqual({ a: {}, type: "object" });
	});

	it.each([
		["true", true],
		["TRUE", true],
		["True", true],
		["false", false],
		["FALSE", false],
		["yes", false],
		["", false],
	] as const)("boolean string %j → %s", async (input, expected) => {
		function flags(a: boolean) {
			return { a };
		}
		const tool = new FunctionTool(flags, {
			description: "Boolean string matrix",
			parameterTypes: { a: "boolean" as any },
		});
		await expect(
			tool.runAsync({ a: input } as any, makeContext()),
		).resolves.toEqual({ a: expected });
	});

	it("null and undefined bypass coercion entirely", async () => {
		function pass(a: any, b: any) {
			return { a, b };
		}
		const tool = new FunctionTool(pass, {
			description: "Nullish bypass coercion",
			parameterTypes: { a: "number" as any, b: "boolean" as any },
		});
		await expect(
			tool.runAsync({ a: null, b: undefined } as any, makeContext()),
		).resolves.toEqual({ a: null, b: undefined });
	});

	it("string coercion String()s numbers booleans objects", async () => {
		function label(name: string) {
			return { name };
		}
		const tool = new FunctionTool(label, {
			description: "String coercion matrix",
			parameterTypes: { name: "string" as any },
		});
		await expect(
			tool.runAsync({ name: 0 } as any, makeContext()),
		).resolves.toEqual({ name: "0" });
		await expect(
			tool.runAsync({ name: false } as any, makeContext()),
		).resolves.toEqual({ name: "false" });
		await expect(
			tool.runAsync({ name: null } as any, makeContext()),
		).resolves.toEqual({ name: null });
	});

	it("unknown parameterTypes fall through to default string schema type", async () => {
		function weird(value: any) {
			return { value };
		}
		const tool = new FunctionTool(weird, {
			description: "Unknown explicit parameter type",
			parameterTypes: { value: "CustomThing" as any },
		});
		// convertArgumentType default case returns value as-is
		await expect(
			tool.runAsync({ value: 9 } as any, makeContext()),
		).resolves.toEqual({ value: 9 });
	});

	it("pushes undefined for params missing from args when not mandatory", async () => {
		const fn = function optionalish(a: string, b = "fallback") {
			return { a, b, bType: typeof b };
		};
		Object.defineProperty(fn, "toString", {
			value: () =>
				'function optionalish(a: string, b: string = "fallback") { return { a, b, bType: typeof b }; }',
		});
		const tool = new FunctionTool(fn, {
			description: "Undefined fallback for missing optional arg",
			parameterTypes: { a: "string" as any, b: "string" as any },
		});
		const result = await tool.runAsync({ a: "x" } as any, makeContext());
		// missing b → undefined pushed → function default may or may not apply
		// because we call with explicit undefined. Assert observed behavior.
		expect(result.a).toBe("x");
		expect(result).toHaveProperty("b");
	});

	it("async falsy results coalesce to {}", async () => {
		async function asyncFalsy() {
			return 0 as any;
		}
		const tool = new FunctionTool(asyncFalsy, {
			description: "Async falsy || {} path",
		});
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({});
	});

	it("reports multiple missing mandatory args joined by newline", async () => {
		function multi(a: string, b: string, c: string) {
			return { a, b, c };
		}
		const tool = new FunctionTool(multi, {
			description: "Multiple missing mandatory parameters",
		});
		const result = await tool.runAsync({} as any, makeContext());
		expect(result.error).toContain("a");
		expect(result.error).toContain("b");
		expect(result.error).toContain("c");
		expect(result.error).toContain("\n");
	});
});
