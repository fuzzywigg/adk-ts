import { describe, expect, it } from "vitest";
import { buildFunctionDeclaration } from "../../../tools/function/function-utils";

/**
 * Fifteenth leftover: string ignoreParams uses String.includes — multi-char
 * string `"ab"` drops params named `"a"` / `"b"` via character membership,
 * not as a single token. Complements fourteenth substring `toolContext` trap.
 */
describe("function-utils ignoreParams char-includes fifteenth leftover", () => {
	function withSource(
		impl: (...args: any[]) => any,
		source: string,
	): (...args: any[]) => any {
		Object.defineProperty(impl, "toString", { value: () => source });
		return impl;
	}

	const fn = withSource(
		(a: string, b: string, ab: string) => ({ a, b, ab }),
		"function trio(a, b, ab) { return { a, b, ab }; }",
	);
	Object.defineProperty(fn, "name", { value: "trio" });

	it('ignoreParams: "ab" drops a, b, and ab (char + substring includes)', () => {
		const declaration = buildFunctionDeclaration(fn, {
			ignoreParams: "ab" as any,
		});
		// "ab".includes("a"), includes("b"), and includes("ab") are all true
		expect(
			Object.keys(declaration.parameters?.properties || {}).sort(),
		).toEqual([]);
	});

	it('ignoreParams: "a" drops only a (b and ab kept via includes asymmetry)', () => {
		const declaration = buildFunctionDeclaration(fn, {
			ignoreParams: "a" as any,
		});
		const keys = Object.keys(declaration.parameters?.properties || {}).sort();
		// "a".includes("a") true; includes("b") false; includes("ab") false
		expect(keys).toEqual(["ab", "b"]);
	});

	it("array ignoreParams only drops exact names (control)", () => {
		const declaration = buildFunctionDeclaration(fn, {
			ignoreParams: ["ab"],
		});
		expect(
			Object.keys(declaration.parameters?.properties || {}).sort(),
		).toEqual(["a", "b"]);
	});
});
