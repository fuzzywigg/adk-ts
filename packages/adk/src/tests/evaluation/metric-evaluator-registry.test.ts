import { describe, expect, it, vi } from "vitest";
import type { EvalMetric } from "../../evaluation/eval-metrics";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { FinalResponseMatchV2Evaluator } from "../../evaluation/final-response-match-v2";
import type { LlmAsJudge } from "../../evaluation/llm-as-judge";
import { Label } from "../../evaluation/llm-as-judge-utils";
import {
	DEFAULT_METRIC_EVALUATOR_REGISTRY,
	type EvaluatorConstructor,
	MetricEvaluatorRegistry,
} from "../../evaluation/metric-evaluator-registry";
import { ResponseEvaluator } from "../../evaluation/response-evaluator";
import { SafetyEvaluatorV1 } from "../../evaluation/safety-evaluator";
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

	it("default registry creates ResponseEvaluator for RESPONSE_MATCH_SCORE", async () => {
		const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});
		expect(evaluator).toBeInstanceOf(ResponseEvaluator);

		const result = await evaluator.evaluateInvocations(
			[
				{
					userContent: { parts: [{ text: "q" }] },
					creationTimestamp: 1,
					finalResponse: { role: "model", parts: [{ text: "hello world" }] },
				},
			],
			[
				{
					userContent: { parts: [{ text: "q" }] },
					creationTimestamp: 1,
					finalResponse: { role: "model", parts: [{ text: "hello world" }] },
				},
			],
		);
		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("default registry creates FinalResponseMatchV2Evaluator", () => {
		const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
			metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
			threshold: 0.5,
		});
		expect(evaluator).toBeInstanceOf(FinalResponseMatchV2Evaluator);
	});

	it("default registry creates SafetyEvaluatorV1", () => {
		const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
			metricName: PrebuiltMetrics.SAFETY_V1,
			threshold: 0.5,
		});
		expect(evaluator).toBeInstanceOf(SafetyEvaluatorV1);
	});

	it("default registry metric infos for match metrics expose intervals", () => {
		const metrics = DEFAULT_METRIC_EVALUATOR_REGISTRY.getRegisteredMetrics();
		const match = metrics.find(
			(m) => m.metricName === PrebuiltMetrics.RESPONSE_MATCH_SCORE,
		);
		const matchV2 = metrics.find(
			(m) => m.metricName === PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
		);
		expect(match?.metricValueInfo.interval).toEqual({
			minValue: 0,
			maxValue: 1,
			openAtMin: false,
			openAtMax: false,
		});
		expect(matchV2?.metricValueInfo.interval).toEqual({
			minValue: 0,
			maxValue: 1,
			openAtMin: false,
			openAtMax: false,
		});
	});

	it("getRegisteredMetrics returns defensive copies", () => {
		const registry = new MetricEvaluatorRegistry();
		registry.registerEvaluator(
			StubEvaluator.getMetricInfo(),
			StubEvaluatorClass,
		);
		const first = registry.getRegisteredMetrics();
		first[0].metricName = "mutated";
		const second = registry.getRegisteredMetrics();
		expect(second[0].metricName).toBe("stub_metric");
	});

	it("can replace FINAL_RESPONSE_MATCH_V2 with a stub that still evaluates", async () => {
		const registry = new MetricEvaluatorRegistry();
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID, Label.VALID]);
		class MatchV2Stub extends FinalResponseMatchV2Evaluator {
			constructor(metric: EvalMetric) {
				super(metric, { sampleJudge } as unknown as LlmAsJudge);
			}
		}
		registry.registerEvaluator(
			FinalResponseMatchV2Evaluator.getMetricInfo(),
			MatchV2Stub as unknown as EvaluatorConstructor,
		);
		const evaluator = registry.getEvaluator({
			metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
			threshold: 0.5,
		});
		const result = await evaluator.evaluateInvocations(
			[
				{
					userContent: { parts: [{ text: "q" }] },
					creationTimestamp: 1,
					finalResponse: { role: "model", parts: [{ text: "a" }] },
				},
			],
			[
				{
					userContent: { parts: [{ text: "q" }] },
					creationTimestamp: 1,
					finalResponse: { role: "model", parts: [{ text: "g" }] },
				},
			],
		);
		expect(result.overallScore).toBe(1);
		expect(sampleJudge).toHaveBeenCalled();
	});
});
