import { describe, expect, it } from "vitest";
import { buildFunctionDeclaration } from "../../../tools/function/function-utils";

/**
 * Fourteenth leftover: ignoreParams || [] — truthy string uses String.includes
 * substring matching; empty string falls through to [].
 */
describe("function-utils ignoreParams string substring fourteenth leftover", () => {
	function withSource(
		impl: (...args: any[]) => any,
		source: string,
	): (...args: any[]) => any {
		Object.defineProperty(impl, "toString", { value: () => source });
		return impl;
	}

	const fn = withSource(
		(tool: string, toolContext: unknown) => ({ tool, toolContext }),
		"function lookup(tool, toolContext) { return { tool, toolContext }; }",
	);
	Object.defineProperty(fn, "name", { value: "lookup" });

	it('ignoreParams: "" coalesces via || to [] so both params remain', () => {
		const declaration = buildFunctionDeclaration(fn, {
			ignoreParams: "" as any,
		});
		expect(Object.keys(declaration.parameters?.properties || {})).toEqual([
			"tool",
			"toolContext",
		]);
	});

	it('ignoreParams string "toolContext" substring-matches and drops both tool and toolContext', () => {
		const declaration = buildFunctionDeclaration(fn, {
			ignoreParams: "toolContext" as any,
		});
		// "toolContext".includes("tool") === true and includes("toolContext")
		expect(declaration.parameters?.properties).toEqual({});
		expect(declaration.parameters?.required).toBeUndefined();
	});

	it("array ignoreParams only drops exact names (control asymmetry)", () => {
		const declaration = buildFunctionDeclaration(fn, {
			ignoreParams: ["toolContext"],
		});
		expect(Object.keys(declaration.parameters?.properties || {})).toEqual([
			"tool",
		]);
	});
});
