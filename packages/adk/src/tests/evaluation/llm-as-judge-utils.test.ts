import { describe, expect, it } from "vitest";
import { EvalStatus } from "../../evaluation/evaluator";
import {
	getEvalStatus,
	getMajorityEvalStatus,
	getTextFromContent,
	Label,
} from "../../evaluation/llm-as-judge-utils";

describe("llm-as-judge-utils", () => {
	it("joins non-empty text parts from content", () => {
		expect(
			getTextFromContent({
				parts: [{ text: "hello" }, { text: "" }, { text: "world" }, {}],
			}),
		).toBe("hello\nworld");
		expect(getTextFromContent(undefined)).toBe("");
		expect(getTextFromContent({})).toBe("");
	});

	it("maps scores to pass/fail using a threshold", () => {
		expect(getEvalStatus(0.8, 0.7)).toBe(EvalStatus.PASSED);
		expect(getEvalStatus(0.6, 0.7)).toBe(EvalStatus.FAILED);
	});

	it("computes majority status across labels", () => {
		expect(getMajorityEvalStatus([], 0.5)).toBe(EvalStatus.NOT_EVALUATED);
		expect(
			getMajorityEvalStatus([Label.VALID, Label.VALID, Label.INVALID], 0.5),
		).toBe(EvalStatus.PASSED);
		expect(
			getMajorityEvalStatus([Label.VALID, Label.INVALID, Label.INVALID], 0.5),
		).toBe(EvalStatus.FAILED);
	});

	it("returns empty string for empty parts arrays", () => {
		expect(getTextFromContent({ parts: [] })).toBe("");
	});

	it("keeps whitespace-only text parts because they are truthy", () => {
		expect(
			getTextFromContent({
				parts: [{ text: "alpha" }, { text: "   " }, { text: "beta" }],
			}),
		).toBe("alpha\n   \nbeta");
	});

	it("returns a single part unchanged when it is the only text", () => {
		expect(getTextFromContent({ parts: [{ text: "solo" }] })).toBe("solo");
	});

	it("passes when score equals the threshold exactly", () => {
		expect(getEvalStatus(0.5, 0.5)).toBe(EvalStatus.PASSED);
		expect(getEvalStatus(0, 0)).toBe(EvalStatus.PASSED);
		expect(getEvalStatus(1, 1)).toBe(EvalStatus.PASSED);
	});

	it("fails when score is just below the threshold", () => {
		expect(getEvalStatus(0.499, 0.5)).toBe(EvalStatus.FAILED);
	});

	it("treats NOT_FOUND labels as non-valid in majority scoring", () => {
		expect(
			getMajorityEvalStatus(
				[Label.VALID, Label.NOT_FOUND, Label.NOT_FOUND],
				0.5,
			),
		).toBe(EvalStatus.FAILED);
		expect(
			getMajorityEvalStatus([Label.VALID, Label.VALID, Label.NOT_FOUND], 0.5),
		).toBe(EvalStatus.PASSED);
	});

	it("passes majority when the valid ratio equals the threshold", () => {
		expect(getMajorityEvalStatus([Label.VALID, Label.INVALID], 0.5)).toBe(
			EvalStatus.PASSED,
		);
	});

	it("fails majority when all labels are INVALID", () => {
		expect(getMajorityEvalStatus([Label.INVALID, Label.INVALID], 0.1)).toBe(
			EvalStatus.FAILED,
		);
	});

	it("exposes Label enum string values used by match evaluators", () => {
		expect(Label.VALID).toBe("valid");
		expect(Label.INVALID).toBe("invalid");
		expect(Label.NOT_FOUND).toBe("not_found");
	});
});
