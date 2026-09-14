import type { Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { RougeEvaluator } from "../../evaluation/final-response-match-v1";

function invocation(text?: string): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse:
			text !== undefined ? { role: "model", parts: [{ text }] } : undefined,
	};
}

function multiPart(parts: Part[]): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse: { role: "model", parts },
	};
}

describe("RougeEvaluator leftover edges", () => {
	const evaluator = new RougeEvaluator({
		metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
		threshold: 0.5,
	});

	describe("!response.trim() || !reference.trim()", () => {
		it("returns zero fmeasure when response is whitespace-only", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("   \t\n  ")],
				[invocation("meaningful reference")],
			);
			expect(result.perInvocationResults[0].score).toBe(0);
			expect(result.overallScore).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("returns zero fmeasure when reference is whitespace-only", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("meaningful response")],
				[invocation("  \n\t  ")],
			);
			expect(result.perInvocationResults[0].score).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("returns zero when both sides are whitespace-only", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("   ")],
				[invocation("\n\n")],
			);
			expect(result.overallScore).toBe(0);
		});

		it("returns zero when response is empty string", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("")],
				[invocation("hello")],
			);
			expect(result.perInvocationResults[0].score).toBe(0);
		});

		it("returns zero when reference is empty string", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("hello")],
				[invocation("")],
			);
			expect(result.perInvocationResults[0].score).toBe(0);
		});
	});

	describe("missing parts and finalResponse", () => {
		it("scores zero when actual finalResponse is undefined", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation()],
				[invocation("expected")],
			);
			expect(result.perInvocationResults[0].score).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("scores zero when expected finalResponse is undefined", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("actual")],
				[invocation()],
			);
			expect(result.perInvocationResults[0].score).toBe(0);
		});

		it("scores zero when finalResponse has no parts property", async () => {
			const bare: Invocation = {
				userContent: { parts: [{ text: "hi" }] },
				creationTimestamp: 1,
				finalResponse: { role: "model" },
			};
			const result = await evaluator.evaluateInvocations(
				[bare],
				[invocation("hello")],
			);
			expect(result.overallScore).toBe(0);
		});

		it("scores zero when parts array is empty", async () => {
			const emptyParts: Invocation = {
				userContent: { parts: [{ text: "hi" }] },
				creationTimestamp: 1,
				finalResponse: { role: "model", parts: [] },
			};
			const result = await evaluator.evaluateInvocations(
				[emptyParts],
				[invocation("hello")],
			);
			expect(result.overallScore).toBe(0);
		});
	});

	describe("multi-part join with newlines", () => {
		it("joins multiple text parts with newline before tokenizing", async () => {
			const result = await evaluator.evaluateInvocations(
				[multiPart([{ text: "alpha" }, { text: "beta" }])],
				[multiPart([{ text: "alpha" }, { text: "beta" }])],
			);
			expect(result.overallScore).toBe(1);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});

		it("matches single-part reference against multi-part actual with same tokens", async () => {
			const result = await evaluator.evaluateInvocations(
				[multiPart([{ text: "alpha" }, { text: "beta gamma" }])],
				[invocation("alpha beta gamma")],
			);
			expect(result.overallScore).toBe(1);
		});

		it("filters falsy text parts but keeps whitespace text in join", async () => {
			const withWhitespace = multiPart([
				{ text: "alpha" },
				{ text: "   " },
				{ text: "beta" },
			]);
			const result = await evaluator.evaluateInvocations(
				[withWhitespace],
				[invocation("alpha beta")],
			);
			expect(result.overallScore).toBe(1);
		});

		it("ignores parts without text via filter(Boolean)", async () => {
			const withInline: Invocation = {
				userContent: { parts: [{ text: "hi" }] },
				creationTimestamp: 1,
				finalResponse: {
					role: "model",
					parts: [
						{ inlineData: { data: "x", mimeType: "text/plain" } } as Part,
						{ text: "visible" },
					],
				},
			};
			const result = await evaluator.evaluateInvocations(
				[withInline],
				[invocation("visible")],
			);
			expect(result.overallScore).toBe(1);
		});
	});

	describe("whitespace-only and punctuation edge cases", () => {
		it("scores zero for punctuation-only response after tokenization", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("!!! ???")],
				[invocation("hello")],
			);
			expect(result.overallScore).toBe(0);
		});

		it("scores zero for punctuation-only reference", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("hello tokens")],
				[invocation("??? !!!")],
			);
			expect(result.overallScore).toBe(0);
		});

		it("scores zero for whitespace-padded punctuation on both sides", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("  !!!  ")],
				[invocation("  ???  ")],
			);
			expect(result.overallScore).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});
	});

	describe("empty invocations list", () => {
		it("returns NOT_EVALUATED with empty perInvocationResults", async () => {
			const result = await evaluator.evaluateInvocations([], []);
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
			expect(result.perInvocationResults).toEqual([]);
			expect(result.overallScore).toBeUndefined();
		});
	});

	describe("threshold boundary via getEvalStatus", () => {
		it("passes when score equals threshold", async () => {
			const exact = new RougeEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
				threshold: 0.5,
			});
			const result = await exact.evaluateInvocations(
				[invocation("a b c")],
				[invocation("a")],
			);
			expect(result.overallScore).toBeCloseTo(0.5);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});

		it("fails when score is below threshold", async () => {
			const strict = new RougeEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
				threshold: 0.51,
			});
			const result = await strict.evaluateInvocations(
				[invocation("a b c")],
				[invocation("a")],
			);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});
	});

	describe("multi-invocation aggregation", () => {
		it("averages scores across invocations including zero-score rows", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("same"), invocation("   "), invocation("zzz")],
				[invocation("same"), invocation("ref"), invocation("yyy")],
			);
			expect(result.perInvocationResults[0].score).toBe(1);
			expect(result.perInvocationResults[1].score).toBe(0);
			expect(result.perInvocationResults[2].score).toBe(0);
			expect(result.overallScore).toBeCloseTo(1 / 3);
		});
	});
});
