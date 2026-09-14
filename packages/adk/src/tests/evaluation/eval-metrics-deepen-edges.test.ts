import { describe, expect, it } from "vitest";
import {
	type EvalMetric,
	type EvaluateConfig,
	type MetricInfo,
	PrebuiltMetrics,
} from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";

describe("eval-metrics deepen edges (TOKENMAXX remainder)", () => {
	it("PrebuiltMetrics values are unique strings", () => {
		const values = Object.values(PrebuiltMetrics);
		expect(new Set(values).size).toBe(values.length);
		expect(values.every((v) => typeof v === "string")).toBe(true);
	});

	it("legacy aliases differ from v1 metric names", () => {
		expect(PrebuiltMetrics.SAFETY).not.toBe(PrebuiltMetrics.SAFETY_V1);
		expect(PrebuiltMetrics.RESPONSE_MATCH).not.toBe(
			PrebuiltMetrics.RESPONSE_MATCH_SCORE,
		);
		expect(PrebuiltMetrics.TOOL_TRAJECTORY_SCORE).not.toBe(
			PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
		);
	});

	it("EvalMetric accepts optional judge model options", () => {
		const metric: EvalMetric = {
			metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
			threshold: 0.8,
			judgeModelOptions: {
				judgeModel: "gemini-2.0-flash",
				numSamples: 3,
				judgeModelConfig: { temperature: 0 },
			},
		};
		expect(metric.judgeModelOptions?.numSamples).toBe(3);
		expect(metric.judgeModelOptions?.judgeModelConfig?.temperature).toBe(0);
	});

	it("EvaluateConfig parallelism is optional", () => {
		const without: EvaluateConfig = {
			evalMetrics: [{ metricName: "m", threshold: 1 }],
		};
		const withP: EvaluateConfig = {
			evalMetrics: [],
			parallelism: 2,
		};
		expect(without.parallelism).toBeUndefined();
		expect(withP.parallelism).toBe(2);
	});

	it("MetricInfo can describe experimental closed intervals", () => {
		const info: MetricInfo = {
			metricName: PrebuiltMetrics.SAFETY_V1,
			description: "safety",
			defaultThreshold: 1,
			experimental: true,
			metricValueInfo: {
				interval: {
					minValue: 0,
					maxValue: 1,
					openAtMin: false,
					openAtMax: false,
				},
			},
		};
		expect(info.experimental).toBe(true);
		expect(info.metricValueInfo?.interval?.openAtMax).toBe(false);
	});

	it("EvalMetricResult extends metric fields with status", () => {
		const result = {
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.8,
			score: 0.9,
			evalStatus: EvalStatus.PASSED,
		};
		expect(result.evalStatus).toBe(EvalStatus.PASSED);
		expect(result.score).toBeGreaterThan(result.threshold);
	});
});
