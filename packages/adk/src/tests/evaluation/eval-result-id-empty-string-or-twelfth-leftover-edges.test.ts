import { describe, expect, it } from "vitest";
import { EvalResult } from "../../evaluation/eval-result";

/**
 * Twelfth leftover: EvalResult ctor uses `||` for ids/array (not timestamp).
 * `false`/`0`/`""` become `""` / `[]`; name is assigned as-is (no `||`).
 */
describe("eval-result id empty-string-or twelfth leftover edges", () => {
	it.each([
		{ label: "undefined", value: undefined },
		{ label: "null", value: null },
		{ label: "empty-string", value: "" },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
	])("evalSetResultId $label coalesces via || to empty string", ({ value }) => {
		const result = new EvalResult({ evalSetResultId: value as any });
		expect(result.evalSetResultId).toBe("");
	});

	it.each([
		{ label: "undefined", value: undefined },
		{ label: "null", value: null },
		{ label: "empty-string", value: "" },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
	])("evalSetId $label coalesces via || to empty string", ({ value }) => {
		const result = new EvalResult({ evalSetId: value as any });
		expect(result.evalSetId).toBe("");
	});

	it.each([
		{ label: "undefined", value: undefined },
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: "empty-string", value: "" },
	])("evalCaseResults $label coalesces via || to []", ({ value }) => {
		const result = new EvalResult({ evalCaseResults: value as any });
		expect(result.evalCaseResults).toEqual([]);
	});

	it("truthy ids and array are preserved (control)", () => {
		const cases = [{ evalId: "c1" }] as any;
		const result = new EvalResult({
			evalSetResultId: "r1",
			evalSetId: "s1",
			evalCaseResults: cases,
		});
		expect(result.evalSetResultId).toBe("r1");
		expect(result.evalSetId).toBe("s1");
		expect(result.evalCaseResults).toBe(cases);
	});

	it("evalSetResultName has no || so falsy values are kept", () => {
		expect(new EvalResult({ evalSetResultName: "" }).evalSetResultName).toBe(
			"",
		);
		expect(
			new EvalResult({ evalSetResultName: undefined }).evalSetResultName,
		).toBeUndefined();
		expect(
			new EvalResult({ evalSetResultName: false as any }).evalSetResultName,
		).toBe(false);
	});
});
