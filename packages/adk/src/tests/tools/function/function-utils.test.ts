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

	it("maps JSDoc {bool} to boolean and {undefined} to null", () => {
		const aliased = withSource(
			(_flag: unknown, _empty: unknown) => ({}),
			`/**
 * Alias types
 * @param {bool} flag Toggle
 * @param {undefined} empty Missing value
 */
function aliased(flag, empty) { return {}; }`,
		);
		Object.defineProperty(aliased, "name", { value: "aliased" });

		const declaration = buildFunctionDeclaration(aliased);
		expect(declaration.parameters?.properties?.flag?.type).toBe("boolean");
		expect(declaration.parameters?.properties?.empty?.type).toBe("null");
	});

	it("attaches @param descriptions without requiring a {type}", () => {
		const describeOnly = withSource(
			(_name: string) => _name,
			`/**
 * Names things
 * @param name The display name
 */
function describeOnly(name) { return name; }`,
		);
		Object.defineProperty(describeOnly, "name", { value: "describeOnly" });

		const declaration = buildFunctionDeclaration(describeOnly);
		expect(declaration.parameters?.properties?.name?.description).toBe(
			"The display name",
		);
		expect(declaration.parameters?.properties?.name?.type).toBe("string");
	});

	it("strips multiline JSDoc star prefixes into a trimmed description", () => {
		const multi = withSource(
			() => 1,
			`/**
 * First line of docs
 * Second line of docs
 */
function multi() { return 1; }`,
		);
		Object.defineProperty(multi, "name", { value: "multi" });

		const declaration = buildFunctionDeclaration(multi);
		expect(declaration.description).toContain("First line of docs");
		expect(declaration.description).toContain("Second line of docs");
		expect(declaration.description).not.toMatch(/^\s*\*/);
	});

	it("returns empty properties when every param is ignored", () => {
		const onlyContext = withSource(
			(_toolContext?: unknown) => 1,
			"function onlyContext(toolContext) { return 1; }",
		);
		Object.defineProperty(onlyContext, "name", { value: "onlyContext" });

		const declaration = buildFunctionDeclaration(onlyContext, {
			ignoreParams: ["toolContext"],
		});
		expect(declaration.parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
		expect(declaration.parameters?.required).toBeUndefined();
	});

	it("maps typescript bigint annotations to number schema type", () => {
		const big = withSource(
			(_n: bigint) => _n,
			"function big(n: bigint) { return n; }",
		);
		Object.defineProperty(big, "name", { value: "big" });

		const declaration = buildFunctionDeclaration(big);
		expect(declaration.parameters?.properties?.n?.type).toBe("number");
		expect(declaration.parameters?.required).toEqual(["n"]);
	});
});
