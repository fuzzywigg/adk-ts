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

	it("getTextFromContent returns empty for empty parts array", () => {
		expect(getTextFromContent({ parts: [] })).toBe("");
	});

	it("getTextFromContent skips non-text parts and keeps order", () => {
		expect(
			getTextFromContent({
				parts: [
					{ inlineData: { data: "x", mimeType: "text/plain" } } as any,
					{ text: "first" },
					{ functionCall: { name: "f", args: {} } } as any,
					{ text: "second" },
				],
			}),
		).toBe("first\nsecond");
	});

	it("getTextFromContent treats whitespace-only text as truthy and keeps it", () => {
		expect(
			getTextFromContent({
				parts: [{ text: "  " }, { text: "kept" }],
			}),
		).toBe("  \nkept");
	});

	it("getEvalStatus passes when score equals threshold", () => {
		expect(getEvalStatus(0.5, 0.5)).toBe(EvalStatus.PASSED);
		expect(getEvalStatus(0, 0)).toBe(EvalStatus.PASSED);
		expect(getEvalStatus(1, 1)).toBe(EvalStatus.PASSED);
	});

	it("getEvalStatus fails for scores just below threshold", () => {
		expect(getEvalStatus(0.499999, 0.5)).toBe(EvalStatus.FAILED);
		expect(getEvalStatus(-0.1, 0)).toBe(EvalStatus.FAILED);
	});

	it("getMajorityEvalStatus ignores NOT_FOUND when counting valid ratio", () => {
		expect(
			getMajorityEvalStatus(
				[Label.VALID, Label.NOT_FOUND, Label.NOT_FOUND, Label.NOT_FOUND],
				0.25,
			),
		).toBe(EvalStatus.PASSED);
		expect(
			getMajorityEvalStatus(
				[Label.VALID, Label.NOT_FOUND, Label.NOT_FOUND, Label.NOT_FOUND],
				0.26,
			),
		).toBe(EvalStatus.FAILED);
	});

	it("getMajorityEvalStatus with all INVALID fails for any positive threshold", () => {
		expect(
			getMajorityEvalStatus(
				[Label.INVALID, Label.INVALID, Label.INVALID],
				0.01,
			),
		).toBe(EvalStatus.FAILED);
	});

	it("getMajorityEvalStatus with all VALID passes for threshold 1", () => {
		expect(getMajorityEvalStatus([Label.VALID, Label.VALID], 1)).toBe(
			EvalStatus.PASSED,
		);
	});

	it("getMajorityEvalStatus with mixed VALID/INVALID at exact 0.5", () => {
		expect(getMajorityEvalStatus([Label.VALID, Label.INVALID], 0.5)).toBe(
			EvalStatus.PASSED,
		);
		expect(
			getMajorityEvalStatus([Label.VALID, Label.INVALID, Label.INVALID], 0.5),
		).toBe(EvalStatus.FAILED);
	});

	it("Label enum values are stable strings used by match judges", () => {
		expect(Label.VALID).toBe("valid");
		expect(Label.INVALID).toBe("invalid");
		expect(Label.NOT_FOUND).toBe("not_found");
	});

	it("getTextFromContent with single text part has no trailing newline", () => {
		expect(getTextFromContent({ parts: [{ text: "only" }] })).toBe("only");
	});
});
