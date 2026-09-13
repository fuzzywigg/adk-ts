import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { buildFunctionDeclaration } from "../../../tools/function/function-utils";

function withSource(
	impl: (...args: any[]) => any,
	source: string,
): (...args: any[]) => any {
	Object.defineProperty(impl, "toString", {
		value: () => source,
	});
	return impl;
}

describe("buildFunctionDeclaration", () => {
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
		expect(declaration.parameters?.required).not.toContain("label");
	});

	it("ignores listed params and reads JSDoc types and descriptions", () => {
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
		expect(declaration.parameters?.properties?.id?.description).toContain(
			"User identifier",
		);
		expect(declaration.parameters?.required).toEqual(["id"]);
		expect(declaration.parameters?.properties?.toolContext).toBeUndefined();
	});

	it("defaults unknown typescript types to string", () => {
		const cast = withSource(
			(_value: unknown) => _value,
			"function cast(value: CustomType) { return value; }",
		);
		Object.defineProperty(cast, "name", { value: "cast" });

		const declaration = buildFunctionDeclaration(cast);
		expect(declaration.parameters?.properties?.value?.type).toBe("string");
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

	it("supports arrow functions and empty properties on bad signatures", () => {
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

	it("maps JSDoc array/object/bigint/null/boolean types", () => {
		const shaped = withSource(
			(
				_items: unknown,
				_meta: unknown,
				_flag: unknown,
				_big: unknown,
				_n: unknown,
			) => ({}),
			`/**
 * Shapes values
 * @param {array} items List of values
 * @param {object} meta Metadata bag
 * @param {boolean} flag Toggle
 * @param {bigint} big Large integer
 * @param {null} n Nullable marker
 */
function shaped(items, meta, flag, big, n) { return {}; }`,
		);
		Object.defineProperty(shaped, "name", { value: "shaped" });

		const declaration = buildFunctionDeclaration(shaped);
		expect(declaration.parameters?.properties?.items?.type).toBe("array");
		expect(declaration.parameters?.properties?.meta?.type).toBe("object");
		expect(declaration.parameters?.properties?.flag?.type).toBe("boolean");
		expect(declaration.parameters?.properties?.big?.type).toBe("number");
		expect(declaration.parameters?.properties?.n?.type).toBe("null");
	});

	it("maps TypeScript annotation types for bigint/bool/array/object/null/undefined", () => {
		const annotated = withSource(
			(
				_big: bigint,
				_flag: boolean,
				_items: unknown[],
				_meta: object,
				_n: null,
				_u: undefined,
			) => ({}),
			"function annotated(big: bigint, flag: bool, items: Array, meta: object, n: null, u: undefined) { return {}; }",
		);
		Object.defineProperty(annotated, "name", { value: "annotated" });

		const declaration = buildFunctionDeclaration(annotated);
		expect(declaration.parameters?.properties?.big?.type).toBe("number");
		expect(declaration.parameters?.properties?.flag?.type).toBe("boolean");
		expect(declaration.parameters?.properties?.items?.type).toBe("array");
		expect(declaration.parameters?.properties?.meta?.type).toBe("object");
		expect(declaration.parameters?.properties?.n?.type).toBe("null");
		expect(declaration.parameters?.properties?.u?.type).toBe("null");
		expect(declaration.parameters?.required).toEqual([
			"big",
			"flag",
			"items",
			"meta",
			"n",
			"u",
		]);
	});

	it("reads @param descriptions without braced types", () => {
		const describeOnly = withSource(
			(_name: string) => _name,
			`/**
 * Greets someone
 * @param name Person to greet
 */
function describeOnly(name) { return name; }`,
		);
		Object.defineProperty(describeOnly, "name", { value: "describeOnly" });

		const declaration = buildFunctionDeclaration(describeOnly);
		expect(declaration.parameters?.properties?.name?.description).toBe(
			"Person to greet",
		);
		expect(declaration.parameters?.properties?.name?.type).toBe("string");
	});

	it("prefers JSDoc type over a conflicting TypeScript annotation", () => {
		const conflict = withSource(
			(_count: string) => _count,
			`/**
 * Counts items
 * @param {number} count Item count
 */
function conflict(count: string) { return count; }`,
		);
		Object.defineProperty(conflict, "name", { value: "conflict" });

		const declaration = buildFunctionDeclaration(conflict);
		expect(declaration.parameters?.properties?.count?.type).toBe("number");
		expect(declaration.parameters?.properties?.count?.description).toBe(
			"Item count",
		);
	});

	it("returns empty properties for whitespace-only parameter lists", () => {
		const blank = withSource(() => 1, "function blank(   ) { return 1; }");
		Object.defineProperty(blank, "name", { value: "blank" });

		expect(buildFunctionDeclaration(blank).parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("maps JSDoc bool and undefined aliases", () => {
		const aliases = withSource(
			(_flag: unknown, _empty: unknown) => ({}),
			`/**
 * Alias types
 * @param {bool} flag Toggle
 * @param {undefined} empty Empty marker
 */
function aliases(flag, empty) { return {}; }`,
		);
		Object.defineProperty(aliases, "name", { value: "aliases" });

		const declaration = buildFunctionDeclaration(aliases);
		expect(declaration.parameters?.properties?.flag?.type).toBe("boolean");
		expect(declaration.parameters?.properties?.empty?.type).toBe("null");
	});

	it("leaves description empty when neither options nor JSDoc provide one", () => {
		function bare(x: string) {
			return x;
		}

		const declaration = buildFunctionDeclaration(bare);
		expect(declaration.description).toBe("");
		expect(declaration.parameters?.required).toEqual(["x"]);
	});

	it("ignores multiple listed params and keeps remaining required ones", () => {
		const multi = withSource(
			(
				_a: number,
				_b: string,
				_toolContext?: unknown,
				_context?: unknown,
			) => ({}),
			"function multi(a: number, b: string, toolContext, context) { return {}; }",
		);
		Object.defineProperty(multi, "name", { value: "multi" });

		const declaration = buildFunctionDeclaration(multi, {
			ignoreParams: ["toolContext", "context"],
		});

		expect(Object.keys(declaration.parameters?.properties || {})).toEqual([
			"a",
			"b",
		]);
		expect(declaration.parameters?.required).toEqual(["a", "b"]);
	});

	it("maps unknown JSDoc types to string", () => {
		const custom = withSource(
			(_value: unknown) => _value,
			`/**
 * Custom typed
 * @param {CustomType} value Custom value
 */
function custom(value) { return value; }`,
		);
		Object.defineProperty(custom, "name", { value: "custom" });

		expect(
			buildFunctionDeclaration(custom).parameters?.properties?.value?.type,
		).toBe("string");
	});

	it("handles multi-line JSDoc descriptions with star prefixes cleaned", () => {
		const multiLine = withSource(
			() => "ok",
			`/**
 * First line of the summary.
 * Second line continues the summary.
 */
function multiLine() { return "ok"; }`,
		);
		Object.defineProperty(multiLine, "name", { value: "multiLine" });

		const declaration = buildFunctionDeclaration(multiLine);
		expect(declaration.description).toContain("First line of the summary.");
		expect(declaration.description).toContain(
			"Second line continues the summary.",
		);
		expect(declaration.description).not.toMatch(/^\s*\*/m);
	});
});
