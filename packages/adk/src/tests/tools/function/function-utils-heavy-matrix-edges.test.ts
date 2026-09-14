import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { buildFunctionDeclaration } from "../../../tools/function/function-utils";
import { FunctionTool } from "../../../tools/function/function-tool";
import type { ToolContext } from "../../../tools/tool-context";

function withSource(
	impl: (...args: any[]) => any,
	source: string,
): (...args: any[]) => any {
	Object.defineProperty(impl, "toString", {
		value: () => source,
	});
	return impl;
}

describe("function-utils heavy matrix leftover edges", () => {
	it("uses function name and empty params for parameterless functions", () => {
		function greet() {
			return "hi";
		}
		const declaration = buildFunctionDeclaration(greet);
		expect(declaration.name).toBe("greet");
		expect(declaration.parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("allows name and description overrides", () => {
		function greet() {
			return "hi";
		}
		const declaration = buildFunctionDeclaration(greet, {
			name: "say_hello",
			description: "Says hello",
		});
		expect(declaration.name).toBe("say_hello");
		expect(declaration.description).toBe("Says hello");
	});

	it("marks required params and maps typescript types", () => {
		const configure = withSource(
			(_count: number, _enabled: boolean, _label = "x") => ({}),
			'function configure(count: number, enabled: boolean, label: string = "x") { return {}; }',
		);
		Object.defineProperty(configure, "name", { value: "configure" });
		const declaration = buildFunctionDeclaration(configure);
		expect(declaration.parameters?.required).toEqual(["count", "enabled"]);
		expect(declaration.parameters?.properties?.count?.type).toBe("number");
		expect(declaration.parameters?.properties?.enabled?.type).toBe("boolean");
		expect(declaration.parameters?.properties?.label?.type).toBe("string");
	});

	it("ignores listed params and reads JSDoc types", () => {
		const lookup = withSource(
			(_id: number, _toolContext?: unknown) => 1,
			`/**
 * Looks up a user
 * @param {number} id User identifier
 * @param {string} toolContext Injected context
 */
function lookup(id, toolContext) { return id; }`,
		);
		Object.defineProperty(lookup, "name", { value: "lookup" });
		const declaration = buildFunctionDeclaration(lookup, {
			ignoreParams: ["toolContext"],
		});
		expect(declaration.description).toContain("Looks up a user");
		expect(declaration.parameters?.properties?.id?.type).toBe("number");
		expect(declaration.parameters?.properties?.toolContext).toBeUndefined();
		expect(declaration.parameters?.required).toEqual(["id"]);
	});

	it("defaults unknown typescript types to string", () => {
		const cast = withSource(
			(_value: unknown) => _value,
			"function cast(value: CustomType) { return value; }",
		);
		Object.defineProperty(cast, "name", { value: "cast" });
		expect(
			buildFunctionDeclaration(cast).parameters?.properties?.value?.type,
		).toBe("string");
	});

	it("parses optional parameters with defaults as non-required", () => {
		const maybe = withSource(
			(_id: string | undefined = undefined) => _id,
			"function maybe(id: string = undefined) { return id; }",
		);
		Object.defineProperty(maybe, "name", { value: "maybe" });
		const declaration = buildFunctionDeclaration(maybe);
		expect(declaration.parameters?.properties?.id?.type).toBe("string");
		expect(declaration.parameters?.required || []).not.toContain("id");
	});

	it("supports arrow-like sources and empty properties on bad signatures", () => {
		const arrow = withSource(
			(count: number) => count,
			"function arrow(count: number) { return count; }",
		);
		Object.defineProperty(arrow, "name", { value: "arrow" });
		expect(
			buildFunctionDeclaration(arrow).parameters?.properties?.count?.type,
		).toBe("number");

		const broken = withSource(() => 1, "not a function signature");
		Object.defineProperty(broken, "name", { value: "broken" });
		expect(buildFunctionDeclaration(broken).parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("maps boolean and number JSDoc types", () => {
		const fn = withSource(
			(_a: any, _b: any) => 1,
			`/**
 * Mixed
 * @param {boolean} flag Flag
 * @param {number} count Count
 */
function mixed(flag, count) { return 1; }`,
		);
		Object.defineProperty(fn, "name", { value: "mixed" });
		const declaration = buildFunctionDeclaration(fn);
		expect(declaration.parameters?.properties?.flag?.type).toBe("boolean");
		expect(declaration.parameters?.properties?.count?.type).toBe("number");
	});

	it("handles rest-like signatures without throwing", () => {
		const rest = withSource(
			(..._args: any[]) => 1,
			"function rest(...args) { return 1; }",
		);
		Object.defineProperty(rest, "name", { value: "rest" });
		const declaration = buildFunctionDeclaration(rest);
		expect(declaration.name).toBe("rest");
		expect(declaration.parameters?.type).toBe(Type.OBJECT);
	});
});

describe("FunctionTool heavy matrix leftover edges", () => {
	it("wraps a named function and executes with context", async () => {
		function add(a: number, b: number) {
			return { sum: a + b };
		}
		const tool = new FunctionTool(add, {
			description: "Adds two numbers together",
			parameterTypes: { a: "number" as any, b: "number" as any },
		});
		expect(tool.name).toBe("add");
		const result = await tool.runAsync({ a: 2, b: 3 }, {
			actions: {},
		} as ToolContext);
		expect(result).toEqual({ sum: 5 });
	});

	it("allows name/description overrides in options form", async () => {
		async function impl() {
			return "ok";
		}
		const tool = new FunctionTool(impl, {
			name: "custom_name",
			description: "Custom description long enough",
		});
		expect(tool.name).toBe("custom_name");
		expect(tool.description).toContain("Custom description");
		await expect(
			tool.runAsync({}, { actions: {} } as ToolContext),
		).resolves.toBe("ok");
	});

	it("getDeclaration mirrors buildFunctionDeclaration for the wrapped fn", () => {
		function echo(message: string) {
			return message;
		}
		const tool = new FunctionTool(echo, {
			description: "Echoes a message string",
		});
		const declaration = tool.getDeclaration();
		expect(declaration.name).toBe("echo");
		expect(declaration.parameters?.properties).toBeDefined();
	});
});
