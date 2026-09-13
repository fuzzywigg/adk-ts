import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { EvalStatus } from "../../evaluation/evaluator";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { RougeEvaluator } from "../../evaluation/final-response-match-v1";

function invocation(text?: string): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse:
			text !== undefined ? { role: "model", parts: [{ text }] } : undefined,
	};
}

describe("RougeEvaluator", () => {
	const evaluator = new RougeEvaluator({
		metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
		threshold: 0.5,
	});

	it("exposes metric info", () => {
		const info = RougeEvaluator.getMetricInfo();
		expect(info.metricName).toBe(PrebuiltMetrics.RESPONSE_MATCH_SCORE);
		expect(info.metricValueInfo.interval?.minValue).toBe(0);
		expect(info.metricValueInfo.interval?.maxValue).toBe(1);
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

	it("scores unrelated responses as failed", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("alpha beta")],
			[invocation("completely different words")],
		);

		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("scores empty texts as zero and failed under default threshold", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("")],
			[invocation("")],
		);

		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("returns NOT_EVALUATED when there are no invocations", async () => {
		const result = await evaluator.evaluateInvocations([], []);
		expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		expect(result.perInvocationResults).toEqual([]);
	});

	it("aggregates average score across invocations", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("shared token here"), invocation("zzz")],
			[invocation("shared token there"), invocation("yyy")],
		);

		expect(result.perInvocationResults).toHaveLength(2);
		expect(result.overallScore).toBeGreaterThan(0);
		expect(result.overallScore).toBeLessThan(1);
	});

	it("scores missing finalResponse as zero (empty text path)", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation()],
			[invocation("expected text")],
		);

		expect(result.perInvocationResults[0].score).toBe(0);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("matches despite punctuation and case differences via tokenization", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("Hello, World!")],
			[invocation("hello world")],
		);

		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[0].score).toBe(1);
	});
});
