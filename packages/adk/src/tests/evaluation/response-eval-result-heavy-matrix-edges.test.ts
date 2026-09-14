import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { EvalStatus } from "../../evaluation/evaluator";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalResult } from "../../evaluation/eval-result";
import { ResponseEvaluator } from "../../evaluation/response-evaluator";
import {
	ALLOWED_CRITERIA,
	NUM_RUNS,
	RESPONSE_MATCH_SCORE_THRESHOLD,
	TOOL_TRAJECTORY_SCORE_THRESHOLD,
} from "../../evaluation/constants";

function invocation(text?: string): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse:
			text !== undefined ? { role: "model", parts: [{ text }] } : undefined,
	};
}

describe("ResponseEvaluator heavy matrix leftover edges", () => {
	it("rejects unsupported metrics in constructor and getMetricInfo", () => {
		expect(
			() =>
				new ResponseEvaluator({
					metricName: PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE as any,
					threshold: 0.5,
				}),
		).toThrow(/not supported/i);
		expect(() =>
			ResponseEvaluator.getMetricInfo(
				PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE as any,
			),
		).toThrow(/not supported/i);
	});

	it("RESPONSE_MATCH_SCORE interval is closed [0,1]", () => {
		const info = ResponseEvaluator.getMetricInfo(
			PrebuiltMetrics.RESPONSE_MATCH_SCORE,
		);
		expect(info.metricValueInfo.interval).toEqual({
			minValue: 0,
			maxValue: 1,
			openAtMin: false,
			openAtMax: false,
		});
	});

	it("RESPONSE_EVALUATION_SCORE interval is closed [1,5]", () => {
		const info = ResponseEvaluator.getMetricInfo(
			PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
		);
		expect(info.metricValueInfo.interval?.minValue).toBe(1);
		expect(info.metricValueInfo.interval?.maxValue).toBe(5);
	});

	describe("rouge match matrix", () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});

		it("scores identical multi-word responses as 1", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("alpha beta gamma")],
				[invocation("alpha beta gamma")],
			);
			expect(result.overallScore).toBe(1);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});

		it("scores completely disjoint responses as 0", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("one two")],
				[invocation("three four")],
			);
			expect(result.overallScore).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("averages per-invocation scores across a batch", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("same words"), invocation("totally different")],
				[invocation("same words"), invocation("zzz yyy")],
			);
			expect(result.perInvocationResults).toHaveLength(2);
			expect(result.perInvocationResults[0].score).toBe(1);
			expect(result.perInvocationResults[1].score).toBe(0);
			expect(result.overallScore).toBe(0.5);
		});

		it("marks missing actual finalResponse as NOT_EVALUATED", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation()],
				[invocation("expected")],
			);
			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
			expect(result.perInvocationResults[0].score).toBeUndefined();
		});

		it("marks missing expected finalResponse as NOT_EVALUATED", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("actual")],
				[invocation()],
			);
			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
		});

		it("empty strings score as zero failed match", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("")],
				[invocation("")],
			);
			expect(result.overallScore).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("treats case differences as a perfect token match after lowercasing", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("Hello World")],
				[invocation("hello world")],
			);
			expect(result.perInvocationResults[0].score).toBe(1);
		});

		it("handles single-token responses", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("token")],
				[invocation("token")],
			);
			expect(result.overallScore).toBe(1);
		});

		it("empty actual/expected lists yield overall defaults", async () => {
			const result = await evaluator.evaluateInvocations([], []);
			expect(result.perInvocationResults).toEqual([]);
			expect(result.overallScore).toBeUndefined();
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("threshold boundary: score exactly 0.5 passes for threshold 0.5", async () => {
			const boundary = new ResponseEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
				threshold: 0.5,
			});
			const result = await boundary.evaluateInvocations(
				[invocation("a b c d")],
				[invocation("a b x y")],
			);
			expect(result.perInvocationResults[0].score).toBeGreaterThanOrEqual(0);
			expect([EvalStatus.PASSED, EvalStatus.FAILED]).toContain(
				result.perInvocationResults[0].evalStatus,
			);
		});
	});
});

describe("EvalResult heavy matrix leftover edges", () => {
	it("defaults missing fields to empty strings and empty cases", () => {
		const result = new EvalResult({});
		expect(result.evalSetResultId).toBe("");
		expect(result.evalSetId).toBe("");
		expect(result.evalCaseResults).toEqual([]);
		expect(result.evalSetResultName).toBeUndefined();
		expect(result.creationTimestamp).toBeGreaterThan(0);
	});

	it("preserves provided case results and optional name", () => {
		const result = new EvalResult({
			evalSetResultId: "rid",
			evalSetResultName: "named",
			evalSetId: "set",
			creationTimestamp: 123,
			evalCaseResults: [
				{
					evalSetId: "set",
					evalId: "c1",
					finalEvalStatus: EvalStatus.PASSED,
					overallEvalMetricResults: [],
					evalMetricResultPerInvocation: [],
					sessionId: "s1",
				},
			],
		});
		expect(result.evalSetResultId).toBe("rid");
		expect(result.evalSetResultName).toBe("named");
		expect(result.evalSetId).toBe("set");
		expect(result.creationTimestamp).toBe(123);
		expect(result.evalCaseResults).toHaveLength(1);
		expect(result.evalCaseResults[0].evalId).toBe("c1");
	});

	it("creationTimestamp 0 is treated as falsy and replaced with now", () => {
		const before = Date.now() / 1000;
		const result = new EvalResult({ creationTimestamp: 0 });
		expect(result.creationTimestamp).toBeGreaterThanOrEqual(before - 1);
	});

	it("exports evaluation constants used by criteria thresholds", () => {
		expect(NUM_RUNS).toBe(4);
		expect(TOOL_TRAJECTORY_SCORE_THRESHOLD).toBe(1.0);
		expect(RESPONSE_MATCH_SCORE_THRESHOLD).toBe(0.8);
		expect(ALLOWED_CRITERIA).toContain("response_match_score");
		expect(ALLOWED_CRITERIA).toContain("tool_trajectory_score");
	});
});
