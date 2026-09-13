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

	it("maps JSDoc {bool} and {undefined} via typescript type mapper", () => {
		const aliases = withSource(
			(_flag: unknown, _missing: unknown) => ({}),
			`/**
 * Alias types
 * @param {bool} flag Toggle alias
 * @param {undefined} missing Absent marker
 */
function aliases(flag, missing) { return {}; }`,
		);
		Object.defineProperty(aliases, "name", { value: "aliases" });

		const declaration = buildFunctionDeclaration(aliases);
		expect(declaration.parameters?.properties?.flag?.type).toBe("boolean");
		expect(declaration.parameters?.properties?.missing?.type).toBe("null");
	});

	it("captures spanning @param text when the next tag is on a starred JSDoc line", () => {
		const documented = withSource(
			(_id: string, _label: string) => ({}),
			`/**
 * Multi-param docs
 * @param {string} id Primary
 * identifier spanning lines
 * @param {string} label Short label
 */
function documented(id, label) { return {}; }`,
		);
		Object.defineProperty(documented, "name", { value: "documented" });

		const declaration = buildFunctionDeclaration(documented);
		expect(declaration.parameters?.properties?.id?.description).toContain(
			"Primary",
		);
		expect(declaration.parameters?.properties?.id?.description).toContain(
			"identifier spanning lines",
		);
		expect(declaration.parameters?.properties).toHaveProperty("label");
		expect(declaration.parameters?.required).toEqual(["id", "label"]);
	});

	it("attaches @param descriptions for each documented parameter name", () => {
		const documented = withSource(
			(_id: string, _label: string) => ({}),
			`/**
 * Single-line params
 * @param {string} id Primary identifier
 * @param {string} label Short label
 */
function documented(id, label) { return {}; }`,
		);
		Object.defineProperty(documented, "name", { value: "documented" });

		const declaration = buildFunctionDeclaration(documented);
		expect(declaration.parameters?.properties?.id?.description).toContain(
			"Primary identifier",
		);
		expect(declaration.parameters?.properties?.label?.type).toBe("string");
		expect(declaration.parameters?.required).toEqual(["id", "label"]);
	});

	it("parses real arrow function toString signatures", () => {
		const arrow = withSource(
			(count: number) => count,
			"(count: number) => count",
		);
		Object.defineProperty(arrow, "name", { value: "arrow" });

		const declaration = buildFunctionDeclaration(arrow);
		expect(declaration.parameters?.properties?.count?.type).toBe("number");
		expect(declaration.parameters?.required).toEqual(["count"]);
	});

	it("best-effort handles destructured / non-word parameter names", () => {
		const destructured = withSource(
			(_opts: unknown) => ({}),
			"function destructured({ a, b }: Opts) { return {}; }",
		);
		Object.defineProperty(destructured, "name", { value: "destructured" });

		const declaration = buildFunctionDeclaration(destructured);
		expect(declaration.parameters?.properties).toBeDefined();
		const keys = Object.keys(declaration.parameters?.properties || {});
		expect(keys.length).toBeGreaterThanOrEqual(1);
	});

	it("extracts description from JSDoc when options.description is empty", () => {
		const greet = withSource(
			() => "hi",
			`/**
 * Greets politely
 */
function greet() { return "hi"; }`,
		);
		Object.defineProperty(greet, "name", { value: "greet" });

		const declaration = buildFunctionDeclaration(greet, { description: "" });
		expect(declaration.description).toContain("Greets politely");
	});

	it("returns empty properties for a lone empty parameter string", () => {
		const emptyParams = withSource(
			() => 1,
			"function emptyParams( ) { return 1; }",
		);
		Object.defineProperty(emptyParams, "name", { value: "emptyParams" });

		expect(buildFunctionDeclaration(emptyParams).parameters).toEqual({
			type: Type.OBJECT,
			properties: {},
		});
	});

	it("prefers JSDoc types over TypeScript annotations when both exist", () => {
		const dual = withSource(
			(_n: string) => _n,
			`/**
 * Dual typed
 * @param {number} n Actually a number
 */
function dual(n: string) { return n; }`,
		);
		Object.defineProperty(dual, "name", { value: "dual" });

		const declaration = buildFunctionDeclaration(dual);
		expect(declaration.parameters?.properties?.n?.type).toBe("number");
	});
});
