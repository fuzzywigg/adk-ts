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

describe("function-utils JSDoc fifth leftover matrices", () => {
	it("extracts @param descriptions without types", () => {
		const fn = withSource(
			(_id: string, _label: string) => 1,
			`/**
 * Looks things up
 * @param id The identifier
 * @param label Human label
 */
function lookup(id, label) { return 1; }`,
			"lookup",
		);
		const declaration = buildFunctionDeclaration(fn);
		expect(declaration.description).toContain("Looks things up");
		// extractJSDocParams regex is greedy: first @param description swallows
		// subsequent @param lines, so only `id` receives a description blob.
		expect(declaration.parameters?.properties?.id?.description).toContain(
			"The identifier",
		);
		expect(declaration.parameters?.properties?.id?.description).toContain(
			"@param label",
		);
		expect(
			declaration.parameters?.properties?.label?.description,
		).toBeUndefined();
	});

	it("extracts @param {type} name description forms", () => {
		const fn = withSource(
			(_count: number, _enabled: boolean) => 1,
			`/**
 * Configures a thing
 * @param {number} count How many
 * @param {boolean} enabled On/off
 */
function configure(count, enabled) { return 1; }`,
			"configure",
		);
		const declaration = buildFunctionDeclaration(fn);
		expect(declaration.parameters?.properties?.count?.type).toBe("number");
		expect(declaration.parameters?.properties?.enabled?.type).toBe("boolean");
		expect(declaration.parameters?.properties?.count?.description).toContain(
			"How many",
		);
		expect(declaration.parameters?.properties?.count?.description).toContain(
			"@param {boolean} enabled",
		);
		expect(
			declaration.parameters?.properties?.enabled?.description,
		).toBeUndefined();
	});

	it("JSDoc types win over typescript annotations", () => {
		const fn = withSource(
			(_value: string) => _value,
			`/**
 * @param {number} value Forced number from JSDoc
 */
function cast(value: string) { return value; }`,
			"cast",
		);
		expect(
			buildFunctionDeclaration(fn).parameters?.properties?.value?.type,
		).toBe("number");
	});

	it("maps JSDoc array/object/null/bool aliases", () => {
		const cases: Array<[string, string]> = [
			["array", "array"],
			["object", "object"],
			["null", "null"],
			["undefined", "null"],
			["bool", "boolean"],
			["bigint", "number"],
			["Widget", "string"],
		];
		for (const [jsDocType, expected] of cases) {
			const fn = withSource(
				(_v: unknown) => _v,
				`/**
 * @param {${jsDocType}} value X
 */
function cast(value) { return value; }`,
				"cast",
			);
			expect(
				buildFunctionDeclaration(fn).parameters?.properties?.value?.type,
			).toBe(expected);
		}
	});

	it("ignores JSDoc params that are not in the signature", () => {
		const fn = withSource(
			(_a: string) => _a,
			`/**
 * @param {string} a Keep
 * @param {string} ghost Not in signature
 */
function onlyA(a) { return a; }`,
			"onlyA",
		);
		const declaration = buildFunctionDeclaration(fn);
		expect(declaration.parameters?.properties?.a?.description).toContain(
			"Keep",
		);
		expect(declaration.parameters?.properties?.ghost).toBeUndefined();
	});

	it("handles multi-line @param descriptions until next tag", () => {
		const fn = withSource(
			(_id: string) => _id,
			`/**
 * Doc
 * @param id First line
 * continues here
 * @returns something
 */
function lookup(id) { return id; }`,
			"lookup",
		);
		const declaration = buildFunctionDeclaration(fn);
		expect(declaration.parameters?.properties?.id?.description).toContain(
			"First line",
		);
	});

	it("parameterless function with JSDoc still has empty properties", () => {
		const fn = withSource(
			() => 1,
			`/**
 * No params
 * @returns number
 */
function none() { return 1; }`,
			"none",
		);
		expect(buildFunctionDeclaration(fn).parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
		expect(buildFunctionDeclaration(fn).description).toContain("No params");
	});

	it("combines ignoreParams with JSDoc typed params", () => {
		const fn = withSource(
			(_id: number, _toolContext?: unknown) => 1,
			`/**
 * @param {number} id Identifier
 * @param {object} toolContext Injected
 */
function lookup(id, toolContext) { return id; }`,
			"lookup",
		);
		const declaration = buildFunctionDeclaration(fn, {
			ignoreParams: ["toolContext"],
		});
		expect(declaration.parameters?.properties?.id?.type).toBe("number");
		expect(declaration.parameters?.properties?.toolContext).toBeUndefined();
		expect(declaration.parameters?.required).toEqual(["id"]);
	});
});
