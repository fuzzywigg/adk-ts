import { describe, expect, it } from "vitest";
import {
	ALLOWED_CRITERIA,
	NUM_RUNS,
	RESPONSE_EVALUATION_SCORE_THRESHOLD,
	RESPONSE_MATCH_SCORE_THRESHOLD,
	SAFETY_SCORE_THRESHOLD,
	TOOL_TRAJECTORY_SCORE_THRESHOLD,
} from "../../evaluation/constants";
import {
	type EvaluateConfig,
	type EvalMetric,
	type EvalMetricResult,
	type EvalMetricResultPerInvocation,
	type Interval,
	type JudgeModelOptions,
	type MetricInfo,
	type MetricName,
	type MetricValueInfo,
	PrebuiltMetrics,
} from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";

describe("eval-metrics leftover edges", () => {
	it("exposes unique PrebuiltMetrics values", () => {
		const values = Object.values(PrebuiltMetrics);
		expect(new Set(values).size).toBe(values.length);
		expect(values).toHaveLength(8);
	});

	it("keeps PrebuiltMetrics keys aligned with string values", () => {
		expect(PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE).toBe(
			"tool_trajectory_avg_score",
		);
		expect(PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2).toBe(
			"final_response_match_v2",
		);
		expect(PrebuiltMetrics.TOOL_TRAJECTORY_SCORE).toBe("tool_trajectory_score");
		expect(PrebuiltMetrics.RESPONSE_MATCH).toBe("response_match");
		expect(PrebuiltMetrics.SAFETY).toBe("safety");
	});

	it("accepts PrebuiltMetrics and custom strings as MetricName", () => {
		const builtIn: MetricName = PrebuiltMetrics.SAFETY_V1;
		const custom: MetricName = "custom_metric_v1";
		expect(builtIn).toBe("safety_v1");
		expect(custom).toBe("custom_metric_v1");
	});

	it("builds EvalMetric objects with and without judge options", () => {
		const judge: JudgeModelOptions = {
			judgeModel: "gpt-4o-mini",
			numSamples: 3,
			judgeModelConfig: { temperature: 0 },
		};
		const withJudge: EvalMetric = {
			metricName: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
			threshold: RESPONSE_EVALUATION_SCORE_THRESHOLD,
			judgeModelOptions: judge,
		};
		const bare: EvalMetric = {
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: RESPONSE_MATCH_SCORE_THRESHOLD,
		};

		expect(withJudge.judgeModelOptions?.judgeModel).toBe("gpt-4o-mini");
		expect(withJudge.judgeModelOptions?.numSamples).toBe(3);
		expect(bare.judgeModelOptions).toBeUndefined();
		expect(bare.threshold).toBe(0.8);
	});

	it("extends EvalMetric into EvalMetricResult with status and optional score", () => {
		const passed: EvalMetricResult = {
			metricName: PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
			threshold: TOOL_TRAJECTORY_SCORE_THRESHOLD,
			score: 1,
			evalStatus: EvalStatus.PASSED,
		};
		const skipped: EvalMetricResult = {
			metricName: PrebuiltMetrics.SAFETY_V1,
			threshold: SAFETY_SCORE_THRESHOLD,
			evalStatus: EvalStatus.NOT_EVALUATED,
		};

		expect(passed.score).toBe(1);
		expect(passed.evalStatus).toBe(EvalStatus.PASSED);
		expect(skipped.score).toBeUndefined();
		expect(skipped.evalStatus).toBe(EvalStatus.NOT_EVALUATED);
	});

	it("shapes EvalMetricResultPerInvocation around paired invocations", () => {
		const actualInvocation = { invocationId: "a1" } as any;
		const expectedInvocation = { invocationId: "e1" } as any;
		const perInvocation: EvalMetricResultPerInvocation = {
			actualInvocation,
			expectedInvocation,
			evalMetricResults: [
				{
					metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
					threshold: 0.9,
					score: 0.95,
					evalStatus: EvalStatus.PASSED,
				},
			],
		};

		expect(perInvocation.actualInvocation).toBe(actualInvocation);
		expect(perInvocation.expectedInvocation).toBe(expectedInvocation);
		expect(perInvocation.evalMetricResults).toHaveLength(1);
		expect(perInvocation.evalMetricResults[0].metricName).toBe(
			"final_response_match_v2",
		);
	});

	it("supports Interval and MetricValueInfo nesting inside MetricInfo", () => {
		const interval: Interval = {
			minValue: 0,
			openAtMin: false,
			maxValue: 1,
			openAtMax: true,
		};
		const metricValueInfo: MetricValueInfo = { interval };
		const info: MetricInfo = {
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			description: "response match",
			defaultThreshold: RESPONSE_MATCH_SCORE_THRESHOLD,
			experimental: false,
			metricValueInfo,
		};

		expect(info.metricValueInfo?.interval?.maxValue).toBe(1);
		expect(info.metricValueInfo?.interval?.openAtMax).toBe(true);
		expect(info.defaultThreshold).toBe(0.8);
		expect(info.experimental).toBe(false);
	});

	it("builds EvaluateConfig with optional parallelism", () => {
		const withParallel: EvaluateConfig = {
			evalMetrics: [
				{
					metricName: PrebuiltMetrics.TOOL_TRAJECTORY_SCORE,
					threshold: TOOL_TRAJECTORY_SCORE_THRESHOLD,
				},
			],
			parallelism: NUM_RUNS,
		};
		const bare: EvaluateConfig = {
			evalMetrics: [],
		};

		expect(withParallel.parallelism).toBe(4);
		expect(withParallel.evalMetrics[0].metricName).toBe(
			"tool_trajectory_score",
		);
		expect(bare.parallelism).toBeUndefined();
		expect(bare.evalMetrics).toEqual([]);
	});

	it("aligns ALLOWED_CRITERIA entries with PrebuiltMetrics where shared", () => {
		expect(ALLOWED_CRITERIA).toContain(PrebuiltMetrics.TOOL_TRAJECTORY_SCORE);
		expect(ALLOWED_CRITERIA).toContain(
			PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
		);
		expect(ALLOWED_CRITERIA).toContain(PrebuiltMetrics.RESPONSE_MATCH_SCORE);
		expect(ALLOWED_CRITERIA).toContain(PrebuiltMetrics.SAFETY_V1);
		expect(ALLOWED_CRITERIA).toHaveLength(4);
	});

	it("leaves optional MetricInfo fields undefined when omitted", () => {
		const info: MetricInfo = {};
		expect(info.metricName).toBeUndefined();
		expect(info.description).toBeUndefined();
		expect(info.defaultThreshold).toBeUndefined();
		expect(info.experimental).toBeUndefined();
		expect(info.metricValueInfo).toBeUndefined();
	});
});
