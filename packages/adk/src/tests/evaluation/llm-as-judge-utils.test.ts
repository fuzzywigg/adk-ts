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
});
