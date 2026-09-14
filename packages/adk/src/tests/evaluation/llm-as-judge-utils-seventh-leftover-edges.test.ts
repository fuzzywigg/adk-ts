import { describe, expect, it } from "vitest";
import {
	getEvalStatus,
	getMajorityEvalStatus,
	getTextFromContent,
	Label,
} from "../../evaluation/llm-as-judge-utils";
import { EvalStatus } from "../../evaluation/evaluator";

describe("llm-as-judge-utils seventh leftover edges (post #158)", () => {
	it("getTextFromContent returns '' for parts: null", () => {
		expect(
			getTextFromContent({
				role: "model",
				parts: null as unknown as [],
			}),
		).toBe("");
	});

	it("getTextFromContent returns '' for parts: undefined", () => {
		expect(getTextFromContent({ role: "model" } as any)).toBe("");
	});

	it("getTextFromContent filters falsy text via filter(Boolean)", () => {
		expect(
			getTextFromContent({
				parts: [
					{ text: "" },
					{ text: "keep" },
					{ text: undefined as unknown as string },
				],
			}),
		).toBe("keep");
	});

	it("getEvalStatus treats NaN as FAILED (NaN >= threshold is false)", () => {
		expect(getEvalStatus(Number.NaN, 0)).toBe(EvalStatus.FAILED);
		expect(getEvalStatus(Number.NaN, 0.5)).toBe(EvalStatus.FAILED);
	});

	it("getMajorityEvalStatus empty labels → NOT_EVALUATED", () => {
		expect(getMajorityEvalStatus([], 0.5)).toBe(EvalStatus.NOT_EVALUATED);
	});

	it("getMajorityEvalStatus all NOT_FOUND filtered? uses full length including INVALID", () => {
		expect(getMajorityEvalStatus([Label.VALID, Label.INVALID], 0.6)).toBe(
			EvalStatus.FAILED,
		);
		expect(getMajorityEvalStatus([Label.VALID, Label.VALID], 0.5)).toBe(
			EvalStatus.PASSED,
		);
	});
});
