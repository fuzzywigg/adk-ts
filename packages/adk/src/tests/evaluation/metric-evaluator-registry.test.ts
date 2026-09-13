import { describe, expect, it, vi } from "vitest";
import type { EvalMetric } from "../../evaluation/eval-metrics";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import {
	DEFAULT_METRIC_EVALUATOR_REGISTRY,
	type EvaluatorConstructor,
	MetricEvaluatorRegistry,
} from "../../evaluation/metric-evaluator-registry";
import { FinalResponseMatchV2Evaluator } from "../../evaluation/final-response-match-v2";
import { ResponseEvaluator } from "../../evaluation/response-evaluator";
import { TrajectoryEvaluator } from "../../evaluation/trajectory-evaluator";

class StubEvaluator {
	constructor(public metric: EvalMetric) {}

	static getMetricInfo() {
		return {
			metricName: "stub_metric",
			description: "stub",
			defaultThreshold: 0.5,
		};
	}

	async evaluateInvocations() {
		return {
			overallScore: 1,
			overallEvalStatus: 1,
			perInvocationResults: [],
		};
	}
}

const StubEvaluatorClass = StubEvaluator as unknown as EvaluatorConstructor;

describe("MetricEvaluatorRegistry", () => {
	it("registers evaluators and creates instances", () => {
		const registry = new MetricEvaluatorRegistry();
		registry.registerEvaluator(
			StubEvaluator.getMetricInfo(),
			StubEvaluatorClass,
		);

		const evaluator = registry.getEvaluator({
			metricName: "stub_metric",
			threshold: 0.8,
		});
		expect(evaluator).toBeInstanceOf(StubEvaluator);
		expect((evaluator as unknown as StubEvaluator).metric.threshold).toBe(0.8);
		expect(registry.getRegisteredMetrics()).toEqual([
			StubEvaluator.getMetricInfo(),
		]);
	});

	it("throws for unknown metrics and logs updates", () => {
		const registry = new MetricEvaluatorRegistry();
		const info = vi.spyOn(console, "info").mockImplementation(() => {});

		expect(() =>
			registry.getEvaluator({ metricName: "missing", threshold: 1 }),
		).toThrow("missing not found in registry.");

		registry.registerEvaluator(
			StubEvaluator.getMetricInfo(),
			StubEvaluatorClass,
		);
		registry.registerEvaluator(
			StubEvaluator.getMetricInfo(),
			StubEvaluatorClass,
		);
		expect(info).toHaveBeenCalled();
	});

	it("ships default prebuilt metrics", () => {
		const names = DEFAULT_METRIC_EVALUATOR_REGISTRY.getRegisteredMetrics().map(
			(metric) => metric.metricName,
		);

		expect(names).toContain(PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE);
		expect(names).toContain(PrebuiltMetrics.RESPONSE_EVALUATION_SCORE);
		expect(names).toContain(PrebuiltMetrics.RESPONSE_MATCH_SCORE);
		expect(names).toContain(PrebuiltMetrics.SAFETY_V1);
		expect(names).toContain(PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2);

		const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
			metricName: PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
			threshold: 1,
		});
		expect(evaluator).toBeInstanceOf(TrajectoryEvaluator);
	});

	it("instantiates ResponseEvaluator and FinalResponseMatchV2 from defaults", () => {
		const response = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.8,
		});
		expect(response).toBeInstanceOf(ResponseEvaluator);

		const matchV2 = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
			metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
			threshold: 0.8,
			judgeModelOptions: {
				judgeModel: "fake-judge",
				numSamples: 1,
			},
		});
		expect(matchV2).toBeInstanceOf(FinalResponseMatchV2Evaluator);
	});
});
