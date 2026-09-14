import { describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { FinalResponseMatchV2Evaluator } from "../../evaluation/final-response-match-v2";
import { Label } from "../../evaluation/llm-as-judge-utils";
import {
	DEFAULT_METRIC_EVALUATOR_REGISTRY,
	MetricEvaluatorRegistry,
} from "../../evaluation/metric-evaluator-registry";

function invocation(text: string): Invocation {
	return {
		userContent: { parts: [{ text: "q" }] },
		creationTimestamp: 1,
		finalResponse: { role: "model", parts: [{ text }] },
	};
}

describe("MetricEvaluatorRegistry seventh leftover edges (post #158)", () => {
	it("default registry constructs V2 without judgeModelOptions", () => {
		const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
			metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
			threshold: 0.5,
		});
		expect(evaluator).toBeInstanceOf(FinalResponseMatchV2Evaluator);
		expect((evaluator as any).metric.judgeModelOptions).toBeUndefined();
	});

	it("registry V2 evaluate uses numSamples ?? 5 when judgeModelOptions omitted", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
			},
			{ sampleJudge } as any,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("actual")],
			[invocation("golden")],
		);

		expect(sampleJudge).toHaveBeenCalledWith(
			expect.any(String),
			5,
			expect.any(Function),
			undefined,
		);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("getRegisteredMetrics returns shallow copies (mutating clone does not corrupt registry)", () => {
		const registry = new MetricEvaluatorRegistry();
		registry.registerEvaluator(
			FinalResponseMatchV2Evaluator.getMetricInfo(),
			FinalResponseMatchV2Evaluator as any,
		);
		const metrics = registry.getRegisteredMetrics();
		metrics[0].description = "mutated";
		const again = registry.getRegisteredMetrics();
		expect(again[0].description).not.toBe("mutated");
	});

	it("legacy PrebuiltMetrics aliases are not registered on default registry", () => {
		for (const name of [
			PrebuiltMetrics.SAFETY,
			PrebuiltMetrics.RESPONSE_MATCH,
			PrebuiltMetrics.TOOL_TRAJECTORY_SCORE,
		]) {
			expect(() =>
				DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
					metricName: name,
					threshold: 0.5,
				}),
			).toThrow(`${name} not found in registry.`);
		}
	});
});
