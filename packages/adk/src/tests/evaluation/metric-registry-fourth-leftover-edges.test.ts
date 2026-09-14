import { describe, expect, it, vi } from "vitest";
import type { EvalMetric } from "../../evaluation/eval-metrics";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { FinalResponseMatchV2Evaluator } from "../../evaluation/final-response-match-v2";
import {
	DEFAULT_METRIC_EVALUATOR_REGISTRY,
	type EvaluatorConstructor,
	MetricEvaluatorRegistry,
} from "../../evaluation/metric-evaluator-registry";
import { ResponseEvaluator } from "../../evaluation/response-evaluator";
import { TrajectoryEvaluator } from "../../evaluation/trajectory-evaluator";
import { SafetyEvaluatorV1 } from "../../evaluation/safety-evaluator";

class GammaEvaluator {
	constructor(public metric: EvalMetric) {}

	static getMetricInfo() {
		return {
			metricName: "gamma_metric",
			description: "gamma",
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

	async evaluateInvocations() {
		return {
			overallScore: 1,
			overallEvalStatus: EvalStatus.PASSED,
			perInvocationResults: [],
		};
	}
}

class DeltaEvaluator {
	constructor(public metric: EvalMetric) {}

	static getMetricInfo() {
		return {
			metricName: "gamma_metric",
			description: "delta replacement",
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

	async evaluateInvocations() {
		return {
			overallScore: 0,
			overallEvalStatus: EvalStatus.FAILED,
			perInvocationResults: [],
		};
	}
}

const GammaClass = GammaEvaluator as unknown as EvaluatorConstructor;
const DeltaClass = DeltaEvaluator as unknown as EvaluatorConstructor;

describe("MetricEvaluatorRegistry fourth leftover edges", () => {
	it("default registry registers trajectory/response/safety/v2 metrics", () => {
		const names = DEFAULT_METRIC_EVALUATOR_REGISTRY.getRegisteredMetrics().map(
			(m) => m.metricName,
		);
		expect(names).toContain(PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE);
		expect(names).toContain(PrebuiltMetrics.RESPONSE_EVALUATION_SCORE);
		expect(names).toContain(PrebuiltMetrics.RESPONSE_MATCH_SCORE);
		expect(names).toContain(PrebuiltMetrics.SAFETY_V1);
		expect(names).toContain(PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2);
	});

	it("default registry getEvaluator constructs TrajectoryEvaluator", () => {
		const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
			metricName: PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
			threshold: 1,
		});
		expect(evaluator).toBeInstanceOf(TrajectoryEvaluator);
	});

	it("default registry getEvaluator constructs ResponseEvaluator for match", () => {
		const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});
		expect(evaluator).toBeInstanceOf(ResponseEvaluator);
	});

	it("default registry getEvaluator constructs ResponseEvaluator for coherence", () => {
		const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
			threshold: 3,
		});
		expect(evaluator).toBeInstanceOf(ResponseEvaluator);
	});

	it("default registry getEvaluator constructs SafetyEvaluatorV1", () => {
		const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
			metricName: PrebuiltMetrics.SAFETY_V1,
			threshold: 0.5,
		});
		expect(evaluator).toBeInstanceOf(SafetyEvaluatorV1);
	});

	it("default registry getEvaluator constructs FinalResponseMatchV2Evaluator", () => {
		const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
			metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
			threshold: 0.5,
		});
		expect(evaluator).toBeInstanceOf(FinalResponseMatchV2Evaluator);
	});

	it("getRegisteredMetrics returns shallow copies", () => {
		const registry = new MetricEvaluatorRegistry();
		registry.registerEvaluator(GammaEvaluator.getMetricInfo(), GammaClass);
		const first = registry.getRegisteredMetrics();
		first[0].description = "mutated";
		const second = registry.getRegisteredMetrics();
		expect(second[0].description).toBe("gamma");
	});

	it("registerEvaluator overwrite logs via console.info", () => {
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		const registry = new MetricEvaluatorRegistry();
		registry.registerEvaluator(GammaEvaluator.getMetricInfo(), GammaClass);
		registry.registerEvaluator(DeltaEvaluator.getMetricInfo(), DeltaClass);
		expect(info).toHaveBeenCalled();
		expect(String(info.mock.calls[0]?.[0])).toContain("gamma_metric");
		const evaluator = registry.getEvaluator({
			metricName: "gamma_metric",
			threshold: 1,
		});
		expect(evaluator).toBeInstanceOf(DeltaEvaluator);
		info.mockRestore();
	});

	it("throws for unknown metric on empty registry", () => {
		const registry = new MetricEvaluatorRegistry();
		expect(() =>
			registry.getEvaluator({ metricName: "missing", threshold: 0 }),
		).toThrow(/missing not found in registry/i);
	});

	const customMetrics = ["m1", "m2", "m3", "edge_0", ""];

	for (const name of customMetrics) {
		it(`registers and retrieves custom metric ${JSON.stringify(name)}`, () => {
			class Custom {
				constructor(public metric: EvalMetric) {}
				static getMetricInfo() {
					return {
						metricName: name,
						description: name,
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
				async evaluateInvocations() {
					return {
						overallScore: 1,
						overallEvalStatus: EvalStatus.PASSED,
						perInvocationResults: [],
					};
				}
			}
			const registry = new MetricEvaluatorRegistry();
			registry.registerEvaluator(
				Custom.getMetricInfo(),
				Custom as unknown as EvaluatorConstructor,
			);
			const evaluator = registry.getEvaluator({
				metricName: name,
				threshold: 1,
			});
			expect(evaluator).toBeInstanceOf(Custom);
		});
	}
});
