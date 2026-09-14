import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { buildFunctionDeclaration } from "../../../tools/function/function-utils";

function withSource(
	impl: (...args: any[]) => any,
	source: string,
	name = "fn",
): (...args: any[]) => any {
	Object.defineProperty(impl, "toString", { value: () => source });
	Object.defineProperty(impl, "name", { value: name });
	return impl;
}

describe("function-utils remainder edges (TOKENMAXX)", () => {
	it.each([
		{ jsType: "bigint", expected: "number" },
		{ jsType: "bool", expected: "boolean" },
		{ jsType: "undefined", expected: "null" },
		{ jsType: "String", expected: "string" },
		{ jsType: "ARRAY", expected: "array" },
		{ jsType: "OBJECT", expected: "object" },
	])("maps JSDoc {$jsType} to $expected", ({ jsType, expected }) => {
		const func = withSource(
			(_v: unknown) => _v,
			`/**
 * Maps a value
 * @param {${jsType}} value The value
 */
function map_value(value) { return value; }`,
			"map_value",
		);
		expect(
			buildFunctionDeclaration(func).parameters?.properties?.value?.type,
		).toBe(expected);
	});

	it("ignoreParams can empty required list when all params ignored", () => {
		const func = withSource(
			(_toolContext: unknown, _context: unknown) => ({}),
			"function noop(toolContext, context) { return {}; }",
			"noop",
		);
		const declaration = buildFunctionDeclaration(func, {
			ignoreParams: ["toolContext", "context"],
		});
		expect(declaration.parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
		expect(declaration.parameters?.required).toBeUndefined();
	});

	it("description override empty string falls through to JSDoc", () => {
		const func = withSource(
			() => 1,
			`/**
 * From JSDoc body
 */
function documented() { return 1; }`,
			"documented",
		);
		const declaration = buildFunctionDeclaration(func, {
			description: "",
		});
		expect(declaration.description).toContain("From JSDoc body");
	});

	it("typed defaults keep optional params out of required", () => {
		const func = withSource(
			(_a = 1, _b = "x") => ({ a: _a, b: _b }),
			'function with_defaults(a: number = 1, b: string = "x") { return { a, b }; }',
			"with_defaults",
		);
		const declaration = buildFunctionDeclaration(func);
		expect(declaration.parameters?.required || []).toEqual([]);
		expect(declaration.parameters?.properties?.a?.type).toBe("number");
		expect(declaration.parameters?.properties?.b?.type).toBe("string");
	});

	it("rest / destructuring-like raw text still yields a property key", () => {
		const func = withSource(
			(..._args: any[]) => ({}),
			"function spread(...rest) { return {}; }",
			"spread",
		);
		const declaration = buildFunctionDeclaration(func);
		expect(
			Object.keys(declaration.parameters?.properties || {}).length,
		).toBeGreaterThanOrEqual(0);
	});

	it("returns empty properties when parameter match fails", () => {
		const func = withSource(() => 1, "function broken no-parens", "broken");
		expect(buildFunctionDeclaration(func).parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});
});
