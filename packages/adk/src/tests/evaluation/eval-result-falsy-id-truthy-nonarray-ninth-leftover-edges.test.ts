import { describe, expect, it } from "vitest";
import { EvalResult } from "../../evaluation/eval-result";

/**
 * Leftover: EvalResult constructor uses || for ids/arrays — falsy non-string
 * ids (0/false) coalesce to ""; truthy non-array evalCaseResults ({}) is kept.
 */
describe("eval-result falsy id / truthy nonarray ninth leftover edges", () => {
	it.each([
		{ label: "0", value: 0 as unknown as string },
		{ label: "false", value: false as unknown as string },
	] as const)('evalSetResultId: $label → "" via ||', ({ value }) => {
		const result = new EvalResult({ evalSetResultId: value });
		expect(result.evalSetResultId).toBe("");
	});

	it.each([
		{ label: "0", value: 0 as unknown as string },
		{ label: "false", value: false as unknown as string },
	] as const)('evalSetId: $label → "" via ||', ({ value }) => {
		const result = new EvalResult({ evalSetId: value });
		expect(result.evalSetId).toBe("");
	});

	it.each([
		0,
		false,
	] as const)("evalCaseResults: %j is falsy → [] via ||", (value) => {
		const result = new EvalResult({
			evalCaseResults: value as unknown as [],
		});
		expect(result.evalCaseResults).toEqual([]);
	});

	it("truthy non-array evalCaseResults {} is kept (not coerced to [])", () => {
		const weird = { not: "an-array" } as unknown as [];
		const result = new EvalResult({ evalCaseResults: weird });
		expect(result.evalCaseResults).toBe(weird);
		expect(Array.isArray(result.evalCaseResults)).toBe(false);
	});

	it("preserves non-empty string ids (control)", () => {
		const result = new EvalResult({
			evalSetResultId: "rid",
			evalSetId: "sid",
		});
		expect(result.evalSetResultId).toBe("rid");
		expect(result.evalSetId).toBe("sid");
	});
});
