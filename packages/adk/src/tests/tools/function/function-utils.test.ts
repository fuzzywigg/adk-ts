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
});
