import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { FunctionTool } from "../../../tools/function/function-tool";
import { buildFunctionDeclaration } from "../../../tools/function/function-utils";
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

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("FunctionTool + function-utils leftover edges (overnight TOKENMAXX post #150)", () => {
	it("body containing context substring marks accepts-tool-context without injecting unused positional", async () => {
		const impl = withSource(
			(x: string) => ({ x, note: "has context word" }),
			'function annotate(x) { return { x, note: "has context word" }; }',
		);
		Object.defineProperty(impl, "name", { value: "annotate" });
		const tool = new FunctionTool(impl, {
			description: "Mentions context in body only",
		});

		await expect(
			tool.runAsync({ x: "ok" } as any, makeContext()),
		).resolves.toEqual({
			x: "ok",
			note: "has context word",
		});
	});

	it("injects toolContext when parameter is named toolContext", async () => {
		const seen: unknown[] = [];
		const impl = withSource((toolContext: ToolContext, label: string) => {
			seen.push(toolContext);
			return { label };
		}, "function withCtx(toolContext, label) { return { label }; }");
		Object.defineProperty(impl, "name", { value: "withCtx" });
		const tool = new FunctionTool(impl, {
			description: "Takes toolContext param",
		});
		const ctx = makeContext();
		await expect(tool.runAsync({ label: "hi" } as any, ctx)).resolves.toEqual({
			label: "hi",
		});
		expect(seen[0]).toBe(ctx);
	});

	it.each([
		{ type: "NUMBER", input: "7", expected: 7 },
		{ type: "BOOLEAN", input: "TRUE", expected: true },
		{ type: "STRING", input: 99, expected: "99" },
	])("parameterTypes uppercase $type coerces via toLowerCase", async ({
		type,
		input,
		expected,
	}) => {
		const impl = withSource(
			(value: unknown) => ({ value }),
			"function cast(value) { return { value }; }",
		);
		Object.defineProperty(impl, "name", { value: "cast" });
		const tool = new FunctionTool(impl, {
			description: "Uppercase parameterTypes",
			parameterTypes: { value: type as any },
		});
		await expect(
			tool.runAsync({ value: input } as any, makeContext()),
		).resolves.toEqual({ value: expected });
	});

	it("empty string number coercion becomes 0 because Number('') is 0", async () => {
		const impl = withSource(
			(n: unknown) => ({ n }),
			"function num(n) { return { n }; }",
		);
		Object.defineProperty(impl, "name", { value: "num" });
		const tool = new FunctionTool(impl, {
			description: "Empty string number coercion",
			parameterTypes: { n: "number" as any },
		});
		await expect(
			tool.runAsync({ n: "" } as any, makeContext()),
		).resolves.toEqual({ n: 0 });
	});

	it.each([
		{ label: "non-numeric string", value: "abc" },
		{ label: "NaN string", value: "NaN" },
	])("number coercion leaves $label unchanged", async ({ value }) => {
		const impl = withSource(
			(n: unknown) => ({ n }),
			"function num(n) { return { n }; }",
		);
		Object.defineProperty(impl, "name", { value: "num" });
		const tool = new FunctionTool(impl, {
			description: "Number coercion leftovers",
			parameterTypes: { n: "number" as any },
		});
		await expect(
			tool.runAsync({ n: value } as any, makeContext()),
		).resolves.toEqual({ n: value });
	});

	it("mandatory args skip parameters with defaults including typed defaults", async () => {
		const impl = withSource(
			(n: number, label: string) => ({ n, label }),
			"function withDefault(n: number = 1, label: string) { return { n, label }; }",
		);
		Object.defineProperty(impl, "name", { value: "withDefault" });
		const tool = new FunctionTool(impl, {
			description: "Typed default is optional",
		});

		await expect(
			tool.runAsync({ label: "x" } as any, makeContext()),
		).resolves.toEqual({ n: undefined, label: "x" });

		const missing = await tool.runAsync({} as any, makeContext());
		expect(missing.error).toContain("mandatory input parameters");
		expect(missing.error).toContain("label");
		expect(String(missing.error).includes("\nn\n")).toBe(false);
	});

	it("buildFunctionDeclaration returns empty properties for empty param list", () => {
		const empty = withSource(() => 1, "function empty() { return 1; }");
		Object.defineProperty(empty, "name", { value: "empty" });
		expect(buildFunctionDeclaration(empty).parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("JSDoc {String[]} and union-ish {string|number} default to string mapping", () => {
		const impl = withSource(
			(_tags: unknown, _count: unknown) => ({}),
			`/**
 * Mixed JSDoc types
 * @param {String[]} tags Tag list
 * @param {string|number} count Count or id
 */
function mixed(tags, count) { return {}; }`,
		);
		Object.defineProperty(impl, "name", { value: "mixed" });
		const declaration = buildFunctionDeclaration(impl);
		expect(declaration.parameters?.properties?.tags?.type).toBe("string");
		expect(declaration.parameters?.properties?.count?.type).toBe("string");
	});

	it("maps JSDoc bool/bigint/array/object/null types", () => {
		const impl = withSource(
			(_a: unknown, _b: unknown, _c: unknown, _d: unknown, _e: unknown) => ({}),
			`/**
 * @param {bool} a Flag
 * @param {bigint} b Big
 * @param {array} c List
 * @param {object} d Obj
 * @param {null} e Nullish
 */
function typed(a, b, c, d, e) { return {}; }`,
		);
		Object.defineProperty(impl, "name", { value: "typed" });
		const props = buildFunctionDeclaration(impl).parameters?.properties;
		expect(props?.a?.type).toBe("boolean");
		expect(props?.b?.type).toBe("number");
		expect(props?.c?.type).toBe("array");
		expect(props?.d?.type).toBe("object");
		expect(props?.e?.type).toBe("null");
	});

	it("ignores empty parameter tokens and still marks required non-defaults", () => {
		const impl = withSource(
			(a: string, b: number) => ({ a, b }),
			"function pair(a, b) { return { a, b }; }",
		);
		Object.defineProperty(impl, "name", { value: "pair" });
		const declaration = buildFunctionDeclaration(impl);
		expect(declaration.parameters?.required).toEqual(["a", "b"]);
	});

	it("FunctionTool getDeclaration reapplies uppercase parameterTypes overrides", () => {
		const impl = withSource(
			(value: unknown) => value,
			"function cast(value: string) { return value; }",
		);
		Object.defineProperty(impl, "name", { value: "cast" });
		const tool = new FunctionTool(impl, {
			description: "Override declaration type",
			parameterTypes: { value: "NUMBER" as any },
		});
		expect(tool.getDeclaration().parameters?.properties?.value?.type).toBe(
			"NUMBER",
		);
	});

	it("async FunctionTool returns {} when async resolves to falsy nullish", async () => {
		const asyncNull = withSource(async (x: string) => {
			void x;
			return null as any;
		}, "async function asyncNull(x) { return null; }");
		Object.defineProperty(asyncNull, "name", { value: "asyncNull" });
		const tool = new FunctionTool(asyncNull, {
			description: "Async nullish to empty object",
		});
		await expect(
			tool.runAsync({ x: "a" } as any, makeContext()),
		).resolves.toEqual({});
	});

	it("sync FunctionTool returns {} when sync returns undefined", async () => {
		const syncUndef = withSource((x: string) => {
			void x;
			return undefined as any;
		}, "function syncUndef(x) { return undefined; }");
		Object.defineProperty(syncUndef, "name", { value: "syncUndef" });
		const tool = new FunctionTool(syncUndef, {
			description: "Sync undefined to empty object",
		});
		await expect(
			tool.runAsync({ x: "a" } as any, makeContext()),
		).resolves.toEqual({});
	});

	it("error envelope stringifies non-Error throws from wrapped function", async () => {
		const impl = withSource(() => {
			throw "plain";
		}, 'function boom() { throw "plain"; }');
		Object.defineProperty(impl, "name", { value: "boom" });
		const tool = new FunctionTool(impl, {
			description: "Non-error throw",
		});
		await expect(tool.runAsync({} as any, makeContext())).resolves.toEqual({
			error: "Error executing function boom: plain",
		});
	});

	it("convertArgumentType returns null and undefined unchanged", async () => {
		const impl = withSource(
			(n: unknown) => ({ n }),
			"function num(n) { return { n }; }",
		);
		Object.defineProperty(impl, "name", { value: "num" });
		const tool = new FunctionTool(impl, {
			description: "Nullish passthrough",
			parameterTypes: { n: "number" as any },
		});
		await expect(
			tool.runAsync({ n: null } as any, makeContext()),
		).resolves.toEqual({ n: null });
		await expect(
			tool.runAsync({ n: undefined } as any, makeContext()),
		).resolves.toEqual({ n: undefined });
	});
});
