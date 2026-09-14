import { describe, expect, it } from "vitest";
import {
	getMajorityEvalStatus,
	Label,
} from "../../evaluation/llm-as-judge-utils";
import { EvalStatus } from "../../evaluation/evaluator";

/**
 * Eleventh leftover: getMajorityEvalStatus counts `l === Label.VALID` with
 * case-sensitive equality — "VALID"/"Valid" do not count. Distinct from
 * whitespace filterBoolean leftover and #178 numSamples.
 */
describe("llm-as-judge majority label case-sensitivity eleventh leftover", () => {
	it.each([
		"VALID",
		"Valid",
		"vALID",
		" valid",
		"valid ",
	])("cased/padded %j is not Label.VALID → score 0 → FAILED", (label) => {
		expect(getMajorityEvalStatus([label as Label, label as Label], 0.5)).toBe(
			EvalStatus.FAILED,
		);
	});

	it("exact Label.VALID counts toward majority (control)", () => {
		expect(getMajorityEvalStatus([Label.VALID, Label.VALID], 0.5)).toBe(
			EvalStatus.PASSED,
		);
	});

	it("mixed cased impostors among real VALID dilute the score", () => {
		expect(
			getMajorityEvalStatus(
				[Label.VALID, "VALID" as Label, "Valid" as Label],
				0.5,
			),
		).toBe(EvalStatus.FAILED);
		expect(
			getMajorityEvalStatus([Label.VALID, Label.VALID, "VALID" as Label], 0.5),
		).toBe(EvalStatus.PASSED);
	});

	it("INVALID and NOT_FOUND are distinct from VALID (control)", () => {
		expect(getMajorityEvalStatus([Label.INVALID, Label.NOT_FOUND], 0)).toBe(
			EvalStatus.PASSED,
		);
		expect(getMajorityEvalStatus([Label.INVALID, Label.NOT_FOUND], 0.01)).toBe(
			EvalStatus.FAILED,
		);
	});
});
