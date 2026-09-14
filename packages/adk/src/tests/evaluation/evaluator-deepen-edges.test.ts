import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import type { EvalMetric } from "../../evaluation/eval-metrics";
import {
	EvalStatus,
	Evaluator,
	type EvaluationResult,
	type PerInvocationResult,
} from "../../evaluation/evaluator";

class ScoringEvaluator extends Evaluator {
	static override getMetricInfo() {
		return {
			metricName: "scoring",
			description: "scores by length parity",
			metricValueInfo: {
				interval: {
					minValue: 0,
					maxValue: 1,
					openAtMin: false,
					openAtMax: false,
				},
			},
		};
	}

	async evaluateInvocations(
		actualInvocations: Invocation[],
		expectedInvocations: Invocation[],
	): Promise<EvaluationResult> {
		const perInvocationResults: PerInvocationResult[] = actualInvocations.map(
			(actual, index) => ({
				actualInvocation: actual,
				expectedInvocation: expectedInvocations[index] ?? actual,
				score: actual.finalResponse?.parts?.[0]?.text === "ok" ? 1 : 0,
				evalStatus:
					actual.finalResponse?.parts?.[0]?.text === "ok"
						? EvalStatus.PASSED
						: EvalStatus.FAILED,
			}),
		);

		const scores = perInvocationResults.map((r) => r.score ?? 0);
		const overallScore =
			scores.length === 0
				? undefined
				: scores.reduce((a, b) => a + b, 0) / scores.length;

		return {
			overallScore,
			overallEvalStatus:
				overallScore === undefined
					? EvalStatus.NOT_EVALUATED
					: overallScore >= this.metric.threshold
						? EvalStatus.PASSED
						: EvalStatus.FAILED,
			perInvocationResults,
		};
	}
}

describe("Evaluator deepen edges (TOKENMAXX remainder)", () => {
	const metric: EvalMetric = {
		metricName: "scoring",
		threshold: 0.5,
	};

	it("base getMetricInfo throws for both omitted and provided metric names", () => {
		expect(() => Evaluator.getMetricInfo()).toThrow(
			"getMetricInfo() must be implemented by subclass",
		);
		expect(() => Evaluator.getMetricInfo("scoring")).toThrow(
			"getMetricInfo() must be implemented by subclass",
		);
		expect(() => Evaluator.getMetricInfo("")).toThrow(
			"getMetricInfo() must be implemented by subclass",
		);
	});

	it("subclass getMetricInfo returns metric metadata", () => {
		const info = ScoringEvaluator.getMetricInfo();
		expect(info.metricName).toBe("scoring");
		expect(info.metricValueInfo?.interval?.maxValue).toBe(1);
	});

	it("stores the metric on the instance for threshold checks", async () => {
		const evaluator = new ScoringEvaluator({
			metricName: "scoring",
			threshold: 0.75,
		});
		expect((evaluator as any).metric.threshold).toBe(0.75);

		const ok: Invocation = {
			userContent: { parts: [{ text: "q" }] },
			finalResponse: { parts: [{ text: "ok" }] },
			creationTimestamp: 1,
		};
		const bad: Invocation = {
			userContent: { parts: [{ text: "q" }] },
			finalResponse: { parts: [{ text: "no" }] },
			creationTimestamp: 2,
		};

		const passed = await evaluator.evaluateInvocations([ok], [ok]);
		expect(passed.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(passed.overallScore).toBe(1);

		const failed = await evaluator.evaluateInvocations([ok, bad], [ok, bad]);
		expect(failed.overallScore).toBe(0.5);
		expect(failed.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("returns NOT_EVALUATED with undefined score for empty invocations", async () => {
		const evaluator = new ScoringEvaluator(metric);
		const result = await evaluator.evaluateInvocations([], []);
		expect(result).toEqual({
			overallScore: undefined,
			overallEvalStatus: EvalStatus.NOT_EVALUATED,
			perInvocationResults: [],
		});
	});

	it("EvalStatus numeric values stay stable for serialization", () => {
		expect(
			Object.values(EvalStatus).filter((v) => typeof v === "number"),
		).toEqual([1, 2, 3]);
		expect(EvalStatus[EvalStatus.PASSED]).toBe("PASSED");
		expect(EvalStatus[EvalStatus.FAILED]).toBe("FAILED");
		expect(EvalStatus[EvalStatus.NOT_EVALUATED]).toBe("NOT_EVALUATED");
	});
});
