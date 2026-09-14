import { describe, expect, it } from "vitest";
import { EvalStatus } from "../../evaluation/evaluator";
import { getEvalStatus } from "../../evaluation/llm-as-judge-utils";

/**
 * Tenth leftover: getEvalStatus is `score >= threshold` with no NaN guard —
 * NaN comparisons are false, so NaN scores FAIL (including threshold 0).
 */
describe("getEvalStatus NaN comparison tenth leftover edges", () => {
	it("NaN score vs threshold 0 is FAILED (NaN >= 0 is false)", () => {
		expect(getEvalStatus(Number.NaN, 0)).toBe(EvalStatus.FAILED);
	});

	it("NaN score vs NaN threshold is FAILED", () => {
		expect(getEvalStatus(Number.NaN, Number.NaN)).toBe(EvalStatus.FAILED);
	});

	it("finite score vs NaN threshold is FAILED", () => {
		expect(getEvalStatus(1, Number.NaN)).toBe(EvalStatus.FAILED);
	});

	it("score 0 vs threshold 0 is PASSED (control)", () => {
		expect(getEvalStatus(0, 0)).toBe(EvalStatus.PASSED);
	});

	it("Infinity vs finite threshold is PASSED", () => {
		expect(getEvalStatus(Number.POSITIVE_INFINITY, 1)).toBe(EvalStatus.PASSED);
	});
});
