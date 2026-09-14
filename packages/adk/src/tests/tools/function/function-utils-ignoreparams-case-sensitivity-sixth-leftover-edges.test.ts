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

/**
 * Sixth leftover: ignoreParams uses Array.includes (case-sensitive).
 * `ToolContext` does not drop `toolContext`.
 */
describe("function-utils ignoreParams case-sensitivity sixth leftover edges", () => {
	const fn = withSource(
		(_a: string, _toolContext?: unknown) => 1,
		"function lookup(a, toolContext) { return a; }",
		"lookup",
	);

	it("exact toolContext is dropped from properties and required", () => {
		const declaration = buildFunctionDeclaration(fn, {
			ignoreParams: ["toolContext"],
		});
		expect(Object.keys(declaration.parameters?.properties || {})).toEqual([
			"a",
		]);
		expect(declaration.parameters?.required).toEqual(["a"]);
	});

	it.each([
		"ToolContext",
		"TOOLCONTEXT",
		"toolcontext",
		" toolContext",
	] as const)("near-miss ignoreParams %j keeps toolContext", (ignored) => {
		const declaration = buildFunctionDeclaration(fn, {
			ignoreParams: [ignored],
		});
		expect(Object.keys(declaration.parameters?.properties || {})).toEqual([
			"a",
			"toolContext",
		]);
	});
});
