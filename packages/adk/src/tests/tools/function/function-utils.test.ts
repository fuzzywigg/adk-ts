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

	it("maps typescript bool alias and object/array/null/undefined annotations", () => {
		const shaped = withSource(
			(
				_flag: unknown,
				_items: unknown,
				_meta: unknown,
				_empty: unknown,
				_missing: unknown,
			) => ({}),
			"function shaped(flag: bool, items: Array, meta: object, empty: null, missing: undefined) { return {}; }",
		);
		Object.defineProperty(shaped, "name", { value: "shaped" });

		const declaration = buildFunctionDeclaration(shaped);
		expect(declaration.parameters?.properties?.flag?.type).toBe("boolean");
		expect(declaration.parameters?.properties?.items?.type).toBe("array");
		expect(declaration.parameters?.properties?.meta?.type).toBe("object");
		expect(declaration.parameters?.properties?.empty?.type).toBe("null");
		expect(declaration.parameters?.properties?.missing?.type).toBe("null");
	});

	it("prefers JSDoc types over typescript annotations when both exist", () => {
		const dual = withSource(
			(_count: unknown) => _count,
			`/**
 * Dual typed
 * @param {boolean} count Actually a boolean in docs
 */
function dual(count: number) { return count; }`,
		);
		Object.defineProperty(dual, "name", { value: "dual" });

		const declaration = buildFunctionDeclaration(dual);
		expect(declaration.parameters?.properties?.count?.type).toBe("boolean");
	});

	it("handles multiple ignored params mixed with required ones", () => {
		const mixed = withSource(
			(
				_a: string,
				_toolContext: unknown,
				_b: number,
				_context: unknown,
			) => ({}),
			"function mixed(a, toolContext, b, context) { return {}; }",
		);
		Object.defineProperty(mixed, "name", { value: "mixed" });

		const declaration = buildFunctionDeclaration(mixed, {
			ignoreParams: ["toolContext", "context"],
		});
		expect(
			Object.keys(declaration.parameters?.properties || {}).sort(),
		).toEqual(["a", "b"]);
		expect(declaration.parameters?.required).toEqual(["a", "b"]);
	});

	it("uses empty description when no JSDoc and no override are provided", () => {
		function plain(x: string) {
			return x;
		}
		const declaration = buildFunctionDeclaration(plain);
		expect(declaration.description).toBe("");
		expect(declaration.name).toBe("plain");
	});

	it("uses JSDoc when description override is an empty string", () => {
		const documented = withSource(
			() => 1,
			`/**
 * From JSDoc
 */
function documented() { return 1; }`,
		);
		Object.defineProperty(documented, "name", { value: "documented" });

		const declaration = buildFunctionDeclaration(documented, {
			description: "",
		});
		expect(declaration.description).toContain("From JSDoc");
	});

	it("keeps a non-empty explicit description instead of JSDoc", () => {
		const documented = withSource(
			() => 1,
			`/**
 * Should be ignored
 */
function documented() { return 1; }`,
		);
		Object.defineProperty(documented, "name", { value: "documented" });

		const declaration = buildFunctionDeclaration(documented, {
			description: "explicit",
		});
		expect(declaration.description).toBe("explicit");
	});

	it("reads @param descriptions when typed JSDoc annotations are present", () => {
		const multi = withSource(
			(_id: string, _label: string) => ({}),
			`/**
 * Multi params
 * @param {string} id The identifier
 * @param {string} label Short label
 */
function multi(id, label) { return {}; }`,
		);
		Object.defineProperty(multi, "name", { value: "multi" });

		const declaration = buildFunctionDeclaration(multi);
		expect(declaration.parameters?.properties?.id?.type).toBe("string");
		expect(declaration.parameters?.properties?.label?.type).toBe("string");
		expect(declaration.parameters?.properties?.id?.description).toContain(
			"The identifier",
		);
	});

	it("captures a trailing multiline @param description for a single parameter", () => {
		const multi = withSource(
			(_id: string) => ({}),
			`/**
 * Multi line single param
 * @param id The identifier that uniquely
 * selects a record in storage
 */
function multi(id) { return {}; }`,
		);
		Object.defineProperty(multi, "name", { value: "multi" });

		const declaration = buildFunctionDeclaration(multi);
		expect(declaration.parameters?.properties?.id?.description).toContain(
			"The identifier",
		);
		expect(declaration.parameters?.properties?.id?.description).toContain(
			"selects a record",
		);
	});

	it("returns empty properties for a function whose param list is only whitespace", () => {
		const spaced = withSource(() => 1, "function spaced(   ) { return 1; }");
		Object.defineProperty(spaced, "name", { value: "spaced" });
		expect(buildFunctionDeclaration(spaced).parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("keeps parameters without type annotations as string by default", () => {
		const untyped = withSource(
			(_a: unknown, _b: unknown) => ({}),
			"function untyped(a, b) { return {}; }",
		);
		Object.defineProperty(untyped, "name", { value: "untyped" });

		const declaration = buildFunctionDeclaration(untyped);
		expect(declaration.parameters?.properties?.a?.type).toBe("string");
		expect(declaration.parameters?.properties?.b?.type).toBe("string");
		expect(declaration.parameters?.required).toEqual(["a", "b"]);
	});

	it("marks defaulted params optional even when a typescript type is present", () => {
		const optional = withSource(
			(_count = 1) => _count,
			"function optional(count: number = 1) { return count; }",
		);
		Object.defineProperty(optional, "name", { value: "optional" });

		const declaration = buildFunctionDeclaration(optional);
		expect(declaration.parameters?.properties?.count?.type).toBe("number");
		expect(declaration.parameters?.required || []).not.toContain("count");
	});

	it("ignores unknown @param names that are not in the signature", () => {
		const stray = withSource(
			(_real: string) => _real,
			`/**
 * Has stray docs
 * @param {string} real The real one
 * @param {number} ghost Not in signature
 */
function stray(real) { return real; }`,
		);
		Object.defineProperty(stray, "name", { value: "stray" });

		const declaration = buildFunctionDeclaration(stray);
		expect(declaration.parameters?.properties?.real?.type).toBe("string");
		expect(declaration.parameters?.properties?.ghost).toBeUndefined();
	});

	it("maps JSDoc {String}/{Number}/{Boolean} case-insensitively via typescript mapper", () => {
		const cased = withSource(
			(_a: unknown, _b: unknown, _c: unknown) => ({}),
			`/**
 * Cased types
 * @param {String} a Text
 * @param {Number} b Number
 * @param {Boolean} c Boolean
 */
function cased(a, b, c) { return {}; }`,
		);
		Object.defineProperty(cased, "name", { value: "cased" });

		const declaration = buildFunctionDeclaration(cased);
		expect(declaration.parameters?.properties?.a?.type).toBe("string");
		expect(declaration.parameters?.properties?.b?.type).toBe("number");
		expect(declaration.parameters?.properties?.c?.type).toBe("boolean");
	});

	it("supports arrow-style source strings that still contain a parameter list", () => {
		const arrow = withSource((n: number) => n, "(n: number) => { return n; }");
		Object.defineProperty(arrow, "name", { value: "arrow" });
		const declaration = buildFunctionDeclaration(arrow, { name: "arrow_fn" });
		expect(declaration.name).toBe("arrow_fn");
		expect(declaration.parameters?.properties?.n?.type).toBe("number");
	});

	it("does not set required when all remaining params after ignore are optional", () => {
		const onlyOptional = withSource(
			(_toolContext?: unknown, _label = "x") => ({}),
			'function onlyOptional(toolContext, label = "x") { return {}; }',
		);
		Object.defineProperty(onlyOptional, "name", { value: "onlyOptional" });

		const declaration = buildFunctionDeclaration(onlyOptional, {
			ignoreParams: ["toolContext"],
		});
		expect(declaration.parameters?.properties?.label).toBeDefined();
		expect(declaration.parameters?.required).toBeUndefined();
	});
});

describe("buildFunctionDeclaration leftover toString and default type edges", () => {
	it("returns empty properties when toString has no parameter list", () => {
		const bare = withSource(
			() => 1,
			"function bare /* no parens */ { return 1; }",
		);
		Object.defineProperty(bare, "name", { value: "bare" });
		expect(buildFunctionDeclaration(bare).parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("defaults untyped params to string even with JSDoc missing types", () => {
		const untyped = withSource(
			(_a: unknown, _b: unknown) => ({}),
			`/**
 * Untyped
 * @param a First
 * @param b Second
 */
function untyped(a, b) { return {}; }`,
		);
		Object.defineProperty(untyped, "name", { value: "untyped" });
		const declaration = buildFunctionDeclaration(untyped);
		expect(declaration.parameters?.properties?.a?.type).toBe("string");
		expect(declaration.parameters?.properties?.b?.type).toBe("string");
		expect(declaration.parameters?.properties?.a?.description).toContain(
			"First",
		);
		expect(declaration.parameters?.required).toEqual(["a", "b"]);
	});

	it("ignores empty parameter list produced by whitespace-only match groups", () => {
		const emptyish = withSource(() => 0, "function emptyish(,) { return 0; }");
		Object.defineProperty(emptyish, "name", { value: "emptyish" });
		expect(buildFunctionDeclaration(emptyish).parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});
});
