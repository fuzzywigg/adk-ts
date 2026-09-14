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

describe("function-utils fifth leftover option / type matrices", () => {
	it("empty options.name falls through to func.name", () => {
		function greet() {
			return "hi";
		}
		const declaration = buildFunctionDeclaration(greet, { name: "" });
		expect(declaration.name).toBe("greet");
	});

	it("undefined options uses func.name and empty description without JSDoc", () => {
		function bare(a: string) {
			return a;
		}
		const declaration = buildFunctionDeclaration(bare);
		expect(declaration.name).toBe("bare");
		expect(declaration.description).toBe("");
		expect(declaration.parameters?.required).toEqual(["a"]);
	});

	it("non-empty description skips JSDoc extraction", () => {
		const fn = withSource(
			() => 1,
			`/**
 * JSDoc should be ignored
 */
function documented() { return 1; }`,
			"documented",
		);
		const declaration = buildFunctionDeclaration(fn, {
			description: "explicit description wins",
		});
		expect(declaration.description).toBe("explicit description wins");
	});

	it("empty description pulls JSDoc and trims star prefixes", () => {
		const fn = withSource(
			() => 1,
			`/**
 * Line one
 * Line two
 */
function documented() { return 1; }`,
			"documented",
		);
		const declaration = buildFunctionDeclaration(fn, { description: "" });
		expect(declaration.description).toContain("Line one");
		expect(declaration.description).toContain("Line two");
		expect(declaration.description).not.toMatch(/^\*/);
	});

	it("ignoreParams omitted vs [] vs unknown names", () => {
		const fn = withSource(
			(_a: string, _toolContext?: unknown) => 1,
			"function lookup(a, toolContext) { return a; }",
			"lookup",
		);
		const all = buildFunctionDeclaration(fn);
		expect(Object.keys(all.parameters?.properties || {})).toEqual([
			"a",
			"toolContext",
		]);
		const emptyIgnore = buildFunctionDeclaration(fn, { ignoreParams: [] });
		expect(Object.keys(emptyIgnore.parameters?.properties || {})).toEqual([
			"a",
			"toolContext",
		]);
		const ignored = buildFunctionDeclaration(fn, {
			ignoreParams: ["toolContext", "missing"],
		});
		expect(Object.keys(ignored.parameters?.properties || {})).toEqual(["a"]);
	});

	it("returns empty properties when paramMatch fails", () => {
		const fn = withSource(() => 1, "function broken no-parens", "broken");
		expect(buildFunctionDeclaration(fn).parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("returns empty properties for empty parameter token list", () => {
		const fn = withSource(() => 1, "function empty() { return 1; }", "empty");
		expect(buildFunctionDeclaration(fn).parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it.each([
		["string", "string"],
		["number", "number"],
		["bigint", "number"],
		["boolean", "boolean"],
		["bool", "boolean"],
		["array", "array"],
		["object", "object"],
		["null", "null"],
		["undefined", "null"],
		["any", "string"],
		["unknown", "string"],
		["CustomType", "string"],
		["", "string"],
	] as const)("maps typescript type %j → %s", (tsType, expected) => {
		const fn = withSource(
			(_v: unknown) => _v,
			`function cast(value: ${tsType}) { return value; }`,
			"cast",
		);
		expect(
			buildFunctionDeclaration(fn).parameters?.properties?.value?.type,
		).toBe(expected);
	});

	it("optional ? without default stays required; nameMatch leaves token intact", () => {
		const fn = withSource(
			(_x?: string) => _x,
			"function maybe(x?: string) { return x; }",
			"maybe",
		);
		const declaration = buildFunctionDeclaration(fn);
		// isOptional only checks includes("="). nameMatch /^(\w+)/ fails on
		// "x?: string" so the raw token is used as the property key.
		expect(declaration.parameters?.required).toEqual(["x?: string"]);
		expect(declaration.parameters?.properties?.["x?: string"]?.type).toBe(
			"string",
		);
	});

	it("default value marks parameter optional", () => {
		const fn = withSource(
			(_x = "d") => _x,
			'function maybe(x: string = "d") { return x; }',
			"maybe",
		);
		const declaration = buildFunctionDeclaration(fn);
		expect(declaration.parameters?.required || []).not.toContain("x");
		expect(declaration.parameters?.properties?.x?.type).toBe("string");
	});
});
