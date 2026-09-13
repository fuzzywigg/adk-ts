import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_METRIC_EVALUATOR_REGISTRY,
	MetricEvaluatorRegistry,
} from "../../evaluation/metric-evaluator-registry";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { TrajectoryEvaluator } from "../../evaluation/trajectory-evaluator";
import type { EvalMetric } from "../../evaluation/eval-metrics";
import type { Evaluator } from "../../evaluation/evaluator";

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

describe("MetricEvaluatorRegistry", () => {
	it("registers evaluators and creates instances", () => {
		const registry = new MetricEvaluatorRegistry();
		registry.registerEvaluator(
			StubEvaluator.getMetricInfo(),
			StubEvaluator as unknown as new (
				metric: EvalMetric,
			) => Evaluator,
		);

		const evaluator = registry.getEvaluator({
			metricName: "stub_metric",
			threshold: 0.8,
		});
		expect(evaluator).toBeInstanceOf(StubEvaluator);
		expect((evaluator as StubEvaluator).metric.threshold).toBe(0.8);
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
			StubEvaluator as unknown as new (
				metric: EvalMetric,
			) => Evaluator,
		);
		registry.registerEvaluator(
			StubEvaluator.getMetricInfo(),
			StubEvaluator as unknown as new (
				metric: EvalMetric,
			) => Evaluator,
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
});
