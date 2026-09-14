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

class AlphaEvaluator {
	constructor(public metric: EvalMetric) {}

	static getMetricInfo() {
		return {
			metricName: "alpha_metric",
			description: "alpha evaluator",
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
			overallScore: 0.9,
			overallEvalStatus: EvalStatus.PASSED,
			perInvocationResults: [],
		};
	}
}

class BetaEvaluator {
	constructor(public metric: EvalMetric) {}

	static getMetricInfo() {
		return {
			metricName: "alpha_metric",
			description: "beta evaluator replacement",
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
			overallScore: 0.1,
			overallEvalStatus: EvalStatus.FAILED,
			perInvocationResults: [],
		};
	}
}

const AlphaClass = AlphaEvaluator as unknown as EvaluatorConstructor;
const BetaClass = BetaEvaluator as unknown as EvaluatorConstructor;

describe("MetricEvaluatorRegistry leftover edges", () => {
	describe("unknown metric throw", () => {
		it("throws with metric name in message for unregistered metrics", () => {
			const registry = new MetricEvaluatorRegistry();
			expect(() =>
				registry.getEvaluator({
					metricName: "does_not_exist",
					threshold: 0.5,
				}),
			).toThrow("does_not_exist not found in registry.");
		});

		it("throws for empty string metric name", () => {
			const registry = new MetricEvaluatorRegistry();
			expect(() =>
				registry.getEvaluator({ metricName: "", threshold: 1 }),
			).toThrow(" not found in registry.");
		});

		it("throws for prebuilt metric not registered in empty registry", () => {
			const registry = new MetricEvaluatorRegistry();
			expect(() =>
				registry.getEvaluator({
					metricName: PrebuiltMetrics.SAFETY_V1,
					threshold: 1,
				}),
			).toThrow(/not found in registry/);
		});
	});

	describe("register overwrite", () => {
		it("logs console.info when overwriting an existing evaluator", () => {
			const registry = new MetricEvaluatorRegistry();
			const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
			registry.registerEvaluator(AlphaEvaluator.getMetricInfo(), AlphaClass);
			registry.registerEvaluator(BetaEvaluator.getMetricInfo(), BetaClass);
			expect(infoSpy).toHaveBeenCalledWith(
				expect.stringContaining("Updating Evaluator class for alpha_metric"),
			);
			expect(infoSpy).toHaveBeenCalledWith(
				expect.stringContaining("AlphaEvaluator"),
			);
			expect(infoSpy).toHaveBeenCalledWith(
				expect.stringContaining("BetaEvaluator"),
			);
			infoSpy.mockRestore();
		});

		it("uses the latest registered evaluator class for getEvaluator", () => {
			const registry = new MetricEvaluatorRegistry();
			registry.registerEvaluator(AlphaEvaluator.getMetricInfo(), AlphaClass);
			registry.registerEvaluator(BetaEvaluator.getMetricInfo(), BetaClass);
			const evaluator = registry.getEvaluator({
				metricName: "alpha_metric",
				threshold: 0.5,
			});
			expect(evaluator).toBeInstanceOf(BetaEvaluator);
		});

		it("does not log on first registration", () => {
			const registry = new MetricEvaluatorRegistry();
			const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
			registry.registerEvaluator(AlphaEvaluator.getMetricInfo(), AlphaClass);
			expect(infoSpy).not.toHaveBeenCalled();
			infoSpy.mockRestore();
		});

		it("stores a shallow copy of metricInfo on register", () => {
			const registry = new MetricEvaluatorRegistry();
			const info = AlphaEvaluator.getMetricInfo();
			registry.registerEvaluator(info, AlphaClass);
			info.description = "mutated";
			const registered = registry.getRegisteredMetrics()[0];
			expect(registered.description).toBe("alpha evaluator");
		});
	});

	describe("getRegisteredMetrics passthrough", () => {
		it("returns metricInfo objects from registered evaluators", () => {
			const registry = new MetricEvaluatorRegistry();
			registry.registerEvaluator(AlphaEvaluator.getMetricInfo(), AlphaClass);
			const metrics = registry.getRegisteredMetrics();
			expect(metrics).toHaveLength(1);
			expect(metrics[0].metricName).toBe("alpha_metric");
			expect(metrics[0].description).toBe("alpha evaluator");
		});

		it("returns independent copies that do not mutate registry state", () => {
			const registry = new MetricEvaluatorRegistry();
			registry.registerEvaluator(AlphaEvaluator.getMetricInfo(), AlphaClass);
			const metrics = registry.getRegisteredMetrics();
			metrics[0].description = "changed externally";
			expect(registry.getRegisteredMetrics()[0].description).toBe(
				"alpha evaluator",
			);
		});

		it("lists all default prebuilt metrics with correct count", () => {
			const metrics = DEFAULT_METRIC_EVALUATOR_REGISTRY.getRegisteredMetrics();
			expect(metrics.length).toBeGreaterThanOrEqual(5);
			const names = metrics.map((m) => m.metricName);
			expect(names).toContain(PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE);
			expect(names).toContain(PrebuiltMetrics.RESPONSE_EVALUATION_SCORE);
			expect(names).toContain(PrebuiltMetrics.RESPONSE_MATCH_SCORE);
			expect(names).toContain(PrebuiltMetrics.SAFETY_V1);
			expect(names).toContain(PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2);
		});
	});

	describe("getMetricInfo passthrough via evaluator constructors", () => {
		it("TrajectoryEvaluator.getMetricInfo matches registry entry", () => {
			const metrics = DEFAULT_METRIC_EVALUATOR_REGISTRY.getRegisteredMetrics();
			const trajectory = metrics.find(
				(m) => m.metricName === PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
			);
			const direct = TrajectoryEvaluator.getMetricInfo();
			expect(trajectory?.metricName).toBe(direct.metricName);
			expect(trajectory?.description).toBe(direct.description);
		});

		it("ResponseEvaluator.getMetricInfo matches registry entries for both response metrics", () => {
			const metrics = DEFAULT_METRIC_EVALUATOR_REGISTRY.getRegisteredMetrics();
			const evalScore = metrics.find(
				(m) => m.metricName === PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
			);
			const matchScore = metrics.find(
				(m) => m.metricName === PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			);
			expect(evalScore?.description).toBe(
				ResponseEvaluator.getMetricInfo(
					PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
				).description,
			);
			expect(matchScore?.description).toBe(
				ResponseEvaluator.getMetricInfo(PrebuiltMetrics.RESPONSE_MATCH_SCORE)
					.description,
			);
		});

		it("SafetyEvaluatorV1.getMetricInfo matches registry entry", () => {
			const metrics = DEFAULT_METRIC_EVALUATOR_REGISTRY.getRegisteredMetrics();
			const safety = metrics.find(
				(m) => m.metricName === PrebuiltMetrics.SAFETY_V1,
			);
			expect(safety?.metricName).toBe(
				SafetyEvaluatorV1.getMetricInfo().metricName,
			);
		});

		it("FinalResponseMatchV2Evaluator.getMetricInfo matches registry entry", () => {
			const metrics = DEFAULT_METRIC_EVALUATOR_REGISTRY.getRegisteredMetrics();
			const v2 = metrics.find(
				(m) => m.metricName === PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
			);
			expect(v2?.description).toBe(
				FinalResponseMatchV2Evaluator.getMetricInfo().description,
			);
		});
	});

	describe("getEvaluator instance wiring", () => {
		it("passes threshold from EvalMetric to constructed evaluator", () => {
			const registry = new MetricEvaluatorRegistry();
			registry.registerEvaluator(AlphaEvaluator.getMetricInfo(), AlphaClass);
			const evaluator = registry.getEvaluator({
				metricName: "alpha_metric",
				threshold: 0.77,
			});
			expect((evaluator as unknown as AlphaEvaluator).metric.threshold).toBe(
				0.77,
			);
		});

		it("creates fresh instances on each getEvaluator call", () => {
			const registry = new MetricEvaluatorRegistry();
			registry.registerEvaluator(AlphaEvaluator.getMetricInfo(), AlphaClass);
			const a = registry.getEvaluator({
				metricName: "alpha_metric",
				threshold: 0.1,
			});
			const b = registry.getEvaluator({
				metricName: "alpha_metric",
				threshold: 0.9,
			});
			expect(a).not.toBe(b);
			expect((a as unknown as AlphaEvaluator).metric.threshold).toBe(0.1);
			expect((b as unknown as AlphaEvaluator).metric.threshold).toBe(0.9);
		});

		it("resolves default registry TrajectoryEvaluator instance", () => {
			const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
				metricName: PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
				threshold: 1,
			});
			expect(evaluator).toBeInstanceOf(TrajectoryEvaluator);
		});

		it("resolves default registry ResponseEvaluator for match score", () => {
			const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
				threshold: 0.8,
			});
			expect(evaluator).toBeInstanceOf(ResponseEvaluator);
		});
	});
});
