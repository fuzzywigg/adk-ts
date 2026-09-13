import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { EvalStatus } from "../../evaluation/evaluator";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { ResponseEvaluator } from "../../evaluation/response-evaluator";

function invocation(text?: string): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse:
			text !== undefined ? { role: "model", parts: [{ text }] } : undefined,
	};
}

describe("ResponseEvaluator", () => {
	it("rejects unsupported metrics in the constructor", () => {
		expect(
			() =>
				new ResponseEvaluator({
					metricName: PrebuiltMetrics.SAFETY_V1,
					threshold: 0.5,
				}),
		).toThrow(/not supported/i);
	});

	it("exposes RESPONSE_MATCH_SCORE metric info", () => {
		const info = ResponseEvaluator.getMetricInfo(
			PrebuiltMetrics.RESPONSE_MATCH_SCORE,
		);
		expect(info.metricName).toBe(PrebuiltMetrics.RESPONSE_MATCH_SCORE);
		expect(info.metricValueInfo.interval?.minValue).toBe(0);
		expect(info.metricValueInfo.interval?.maxValue).toBe(1);
		expect(info.metricValueInfo.interval?.openAtMin).toBe(false);
		expect(info.metricValueInfo.interval?.openAtMax).toBe(false);
	});

	it("exposes RESPONSE_EVALUATION_SCORE metric info", () => {
		const info = ResponseEvaluator.getMetricInfo(
			PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
		);
		expect(info.metricName).toBe(PrebuiltMetrics.RESPONSE_EVALUATION_SCORE);
		expect(info.metricValueInfo.interval?.minValue).toBe(1);
		expect(info.metricValueInfo.interval?.maxValue).toBe(5);
	});

	it("rejects getMetricInfo for unsupported metrics", () => {
		expect(() =>
			ResponseEvaluator.getMetricInfo(PrebuiltMetrics.SAFETY_V1),
		).toThrow(/not supported/i);
	});

	describe("Rouge RESPONSE_MATCH_SCORE path", () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});

		it("scores identical responses as a perfect match", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("The quick brown fox")],
				[invocation("The quick brown fox")],
			);

			expect(result.overallScore).toBe(1);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
			expect(result.perInvocationResults[0].score).toBe(1);
			expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		});

		it("scores disjoint responses as failed", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("alpha beta")],
				[invocation("completely different words")],
			);

			expect(result.overallScore).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("scores empty texts as zero", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("")],
				[invocation("")],
			);

			expect(result.overallScore).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("returns NOT_EVALUATED when finalResponse is missing", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation()],
				[invocation("expected")],
			);

			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
			expect(result.perInvocationResults[0].score).toBeUndefined();
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("throws when invocation lengths mismatch", async () => {
			await expect(
				evaluator.evaluateInvocations(
					[invocation("a"), invocation("b")],
					[invocation("a")],
				),
			).rejects.toThrow(/must match/i);
		});

		it("aggregates average score across invocations", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("shared token here"), invocation("zzz")],
				[invocation("shared token there"), invocation("yyy")],
			);

			expect(result.perInvocationResults).toHaveLength(2);
			expect(result.overallScore).toBeGreaterThan(0);
			expect(result.overallScore).toBeLessThan(1);
			expect(result.overallScore).toBe(
				((result.perInvocationResults[0].score as number) +
					(result.perInvocationResults[1].score as number)) /
					2,
			);
		});
	});
});
