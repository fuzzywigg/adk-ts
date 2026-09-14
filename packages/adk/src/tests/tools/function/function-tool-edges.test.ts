import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { FunctionTool } from "../../../tools/function/function-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("FunctionTool leftover edges", () => {
	it("treats broken toString signatures as having no mandatory args", async () => {
		function pack(a: string) {
			return { a };
		}
		Object.defineProperty(pack, "toString", {
			value: () => "not a function signature",
		});

		const tool = new FunctionTool(pack, { description: "broken signature" });
		await expect(tool.runAsync({} as any, makeContext())).resolves.toEqual({
			a: undefined,
		});
	});

	it("keeps raw param tokens when nameMatch fails for mandatory args", async () => {
		function pack(payload: any) {
			return { payload };
		}
		Object.defineProperty(pack, "toString", {
			value: () => "function pack({x}, ...rest) { return rest; }",
		});

		const tool = new FunctionTool(pack, { description: "destructured params" });
		const missing = await tool.runAsync({} as any, makeContext());
		expect(missing.error).toContain("mandatory input parameters");
		expect(missing.error).toMatch(/\{x\}|\.\.\.rest/);
	});

	it("getFunctionParameters returns empty list for unmatched signatures", async () => {
		function echo() {
			return { ok: true };
		}
		Object.defineProperty(echo, "toString", {
			value: () => "arrow without parens list",
		});

		const tool = new FunctionTool(echo, { description: "no param list" });
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			ok: true,
		});
	});

	it("keeps raw tokens when getFunctionParameters nameMatch fails", async () => {
		function pack(...args: any[]) {
			return { args };
		}
		Object.defineProperty(pack, "toString", {
			value: () => "function pack({x}: any, ...rest: any[]) { return rest; }",
		});

		const tool = new FunctionTool(pack, {
			description: "raw param walk",
		});
		const result = await tool.runAsync(
			{ "{x}": 1, "...rest": 2 } as any,
			makeContext(),
		);
		expect(result).toBeDefined();
	});

	it("defaults getParameterType to string when declaration omits type", async () => {
		function wrap(value: unknown) {
			return { value, type: typeof value };
		}
		const tool = new FunctionTool(wrap, {
			description: "default string coerce",
		});
		vi.spyOn(tool, "getDeclaration").mockReturnValue({
			name: "wrap",
			description: "default string coerce",
			parameters: {
				type: Type.OBJECT,
				properties: { value: { description: "untyped" } },
			},
		} as any);

		await expect(
			tool.runAsync({ value: 9 } as any, makeContext()),
		).resolves.toEqual({
			value: "9",
			type: "string",
		});
	});

	it("defaults getParameterType to string when properties omit the param entirely", async () => {
		function wrap(value: unknown) {
			return { value, type: typeof value };
		}
		const tool = new FunctionTool(wrap, {
			description: "missing property schema",
		});
		vi.spyOn(tool, "getDeclaration").mockReturnValue({
			name: "wrap",
			description: "missing property schema",
			parameters: {
				type: Type.OBJECT,
				properties: {},
			},
		} as any);

		await expect(
			tool.runAsync({ value: true } as any, makeContext()),
		).resolves.toEqual({
			value: "true",
			type: "string",
		});
	});

	it("defaults getParameterType to string when parameters bag is missing", async () => {
		function wrap(value: unknown) {
			return { value, type: typeof value };
		}
		const tool = new FunctionTool(wrap, {
			description: "no parameters bag",
		});
		vi.spyOn(tool, "getDeclaration").mockReturnValue({
			name: "wrap",
			description: "no parameters bag",
		} as any);

		await expect(
			tool.runAsync({ value: 3 } as any, makeContext()),
		).resolves.toEqual({
			value: "3",
			type: "string",
		});
	});

	it("prefers explicit parameterTypes over declaration schema", async () => {
		function wrap(count: unknown) {
			return { count, type: typeof count };
		}
		const tool = new FunctionTool(wrap, {
			description: "explicit types win",
			parameterTypes: { count: "number" as any },
		});
		vi.spyOn(tool, "getDeclaration").mockReturnValue({
			name: "wrap",
			description: "explicit types win",
			parameters: {
				type: Type.OBJECT,
				properties: { count: { type: Type.STRING } },
			},
		} as any);

		await expect(
			tool.runAsync({ count: "12" } as any, makeContext()),
		).resolves.toEqual({ count: 12, type: "number" });
	});

	it("ignores empty parameter names from trailing commas in toString", async () => {
		function duo(a: string, b: string) {
			return { a, b };
		}
		Object.defineProperty(duo, "toString", {
			value: () => "function duo(a, b, ) { return { a, b }; }",
		});

		const tool = new FunctionTool(duo, { description: "trailing comma" });
		await expect(
			tool.runAsync({ a: "1", b: "2" }, makeContext()),
		).resolves.toEqual({ a: "1", b: "2" });
	});

	it("filters toolContext from mandatory args even with type annotations", async () => {
		function inspect(name: string, toolContext: ToolContext) {
			return { name, hasActions: Boolean(toolContext.actions) };
		}
		Object.defineProperty(inspect, "toString", {
			value: () =>
				"function inspect(name: string, toolContext: ToolContext) { return name; }",
		});

		const tool = new FunctionTool(inspect, { description: "typed context" });
		const missing = await tool.runAsync({} as any, makeContext());
		expect(missing.error).toContain("name");
		expect(missing.error).not.toContain("toolContext");
	});

	it("filters context alias from mandatory args but does not inject it by name", async () => {
		function inspect(name: string, context: ToolContext) {
			return { name, hasActions: Boolean(context?.actions) };
		}
		Object.defineProperty(inspect, "toString", {
			value: () =>
				"function inspect(name: string, context: ToolContext) { return name; }",
		});

		const tool = new FunctionTool(inspect, {
			description: "typed context alias",
		});
		const missing = await tool.runAsync({} as any, makeContext());
		expect(missing.error).toContain("name");
		expect(missing.error).not.toContain("context");

		const result = await tool.runAsync({ name: "n" }, makeContext());
		expect(result).toEqual({ name: "n", hasActions: false });
	});

	it("coerces via parameterTypes when getDeclaration returns nullish parameters.properties", async () => {
		function wrap(flag: unknown) {
			return { flag, type: typeof flag };
		}
		const tool = new FunctionTool(wrap, {
			description: "nullish properties",
			parameterTypes: { flag: "boolean" as any },
		});
		vi.spyOn(tool, "getDeclaration").mockReturnValue({
			name: "wrap",
			description: "nullish properties",
			parameters: { type: Type.OBJECT },
		} as any);

		await expect(
			tool.runAsync({ flag: "TRUE" } as any, makeContext()),
		).resolves.toEqual({ flag: true, type: "boolean" });
	});

	it("leaves unknown parameterTypes values without special coercion", async () => {
		function wrap(value: unknown) {
			return { value };
		}
		const tool = new FunctionTool(wrap, {
			description: "unknown type token",
			parameterTypes: { value: "object" as any },
		});

		const obj = { a: 1 };
		await expect(
			tool.runAsync({ value: obj } as any, makeContext()),
		).resolves.toEqual({ value: obj });
	});

	it("reports mandatory args for rest-only signatures that still match names", async () => {
		function gather(first: string) {
			return { first };
		}
		Object.defineProperty(gather, "toString", {
			value: () => "function gather(first) { return first; }",
		});

		const tool = new FunctionTool(gather, { description: "simple first" });
		const missing = await tool.runAsync({} as any, makeContext());
		expect(missing.error).toContain("first");
	});

	it("handles async functions with broken toString by calling with no mapped args", async () => {
		async function load(id: string) {
			await Promise.resolve();
			return { id: id ?? "fallback" };
		}
		Object.defineProperty(load, "toString", {
			value: () => "async broken",
		});

		const tool = new FunctionTool(load, { description: "async broken sig" });
		await expect(
			tool.runAsync({ id: "1" } as any, makeContext()),
		).resolves.toEqual({ id: "fallback" });
	});
});
