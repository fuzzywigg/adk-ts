import { describe, expect, it } from "vitest";
import { EvalStatus } from "../../evaluation/evaluator";
import {
	getEvalStatus,
	getMajorityEvalStatus,
	getTextFromContent,
	Label,
} from "../../evaluation/llm-as-judge-utils";

describe("llm-as-judge-utils deepen edges (TOKENMAXX remainder)", () => {
	it("filters nullish and empty text parts to empty string", () => {
		expect(
			getTextFromContent({
				parts: [
					{ text: undefined as any },
					{ text: null as any },
					{ text: "" },
					{},
				],
			}),
		).toBe("");
	});

	it("joins only truthy text across mixed part shapes", () => {
		expect(
			getTextFromContent({
				parts: [
					{ text: "a" },
					{ functionCall: { name: "x" } } as any,
					{ text: "b" },
					{ text: 0 as any },
					{ text: "c" },
				],
			}),
		).toBe("a\nb\nc");
	});

	it("majority with a single VALID label respects threshold 1 and 0", () => {
		expect(getMajorityEvalStatus([Label.VALID], 1)).toBe(EvalStatus.PASSED);
		expect(getMajorityEvalStatus([Label.VALID], 0)).toBe(EvalStatus.PASSED);
		expect(getMajorityEvalStatus([Label.INVALID], 0)).toBe(EvalStatus.PASSED);
		expect(getMajorityEvalStatus([Label.INVALID], 0.0001)).toBe(
			EvalStatus.FAILED,
		);
	});

	it("majority at exact 1/3 and 2/3 thresholds", () => {
		const labels = [Label.VALID, Label.INVALID, Label.NOT_FOUND];
		expect(getMajorityEvalStatus(labels, 1 / 3)).toBe(EvalStatus.PASSED);
		expect(getMajorityEvalStatus(labels, 0.34)).toBe(EvalStatus.FAILED);

		const twoValid = [Label.VALID, Label.VALID, Label.INVALID];
		expect(getMajorityEvalStatus(twoValid, 2 / 3)).toBe(EvalStatus.PASSED);
		expect(getMajorityEvalStatus(twoValid, 0.67)).toBe(EvalStatus.FAILED);
	});

	it("getEvalStatus boundary matrix", () => {
		const cases: Array<[number, number, EvalStatus]> = [
			[0, 0, EvalStatus.PASSED],
			[-0.1, 0, EvalStatus.FAILED],
			[1, 1, EvalStatus.PASSED],
			[0.999, 1, EvalStatus.FAILED],
			[Number.POSITIVE_INFINITY, 1, EvalStatus.PASSED],
			[Number.NaN, 0, EvalStatus.FAILED],
		];
		for (const [score, threshold, expected] of cases) {
			expect(getEvalStatus(score, threshold)).toBe(expected);
		}
	});

	it("Label enum values are the judge parse targets", () => {
		expect(Object.values(Label)).toEqual(["valid", "invalid", "not_found"]);
		expect(Label.VALID).not.toBe(Label.INVALID);
		expect(Label.NOT_FOUND).toContain("_");
	});

	it("all-NOT_FOUND majority fails any positive threshold", () => {
		expect(
			getMajorityEvalStatus(
				[Label.NOT_FOUND, Label.NOT_FOUND, Label.NOT_FOUND],
				0.01,
			),
		).toBe(EvalStatus.FAILED);
		expect(getMajorityEvalStatus([Label.NOT_FOUND, Label.NOT_FOUND], 0)).toBe(
			EvalStatus.PASSED,
		);
	});
});
