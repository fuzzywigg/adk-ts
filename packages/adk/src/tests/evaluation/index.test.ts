import { describe, expect, it } from "vitest";
import * as evaluation from "../../evaluation";

describe("evaluation barrel exports", () => {
	it("exposes core evaluator primitives and statuses", () => {
		expect(evaluation.EvalStatus.PASSED).toBeDefined();
		expect(evaluation.EvalStatus.FAILED).toBeDefined();
		expect(evaluation.EvalStatus.NOT_EVALUATED).toBeDefined();
		expect(evaluation.Evaluator).toBeTypeOf("function");
	});

	it("exposes prebuilt metrics and public evaluator classes", () => {
		expect(evaluation.PrebuiltMetrics.RESPONSE_MATCH_SCORE).toBeDefined();
		expect(evaluation.PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE).toBeDefined();
		expect(evaluation.AgentEvaluator).toBeTypeOf("function");
		expect(evaluation.LocalEvalService).toBeTypeOf("function");
		expect(evaluation.TrajectoryEvaluator).toBeTypeOf("function");
		expect(evaluation.RougeEvaluator).toBeTypeOf("function");
		expect(evaluation.FinalResponseMatchV2Evaluator).toBeTypeOf("function");
		expect(evaluation.SafetyEvaluatorV1).toBeTypeOf("function");
	});

	it("exposes EvalResult class for constructing result shells", () => {
		expect(evaluation.EvalResult).toBeTypeOf("function");
		const result = new evaluation.EvalResult({
			evalSetResultId: "r1",
			evalSetId: "s1",
			evalCaseResults: [],
			creationTimestamp: 1,
		});
		expect(result.evalSetId).toBe("s1");
	});

	it("exposes PrebuiltMetrics enum values for all primary metrics", () => {
		expect(evaluation.PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE).toBe(
			"tool_trajectory_avg_score",
		);
		expect(evaluation.PrebuiltMetrics.RESPONSE_EVALUATION_SCORE).toBe(
			"response_evaluation_score",
		);
		expect(evaluation.PrebuiltMetrics.RESPONSE_MATCH_SCORE).toBe(
			"response_match_score",
		);
		expect(evaluation.PrebuiltMetrics.SAFETY_V1).toBe("safety_v1");
		expect(evaluation.PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2).toBe(
			"final_response_match_v2",
		);
	});

	it("exposes EvalMetric-related types via runtime evaluator constructors", () => {
		expect(evaluation.TrajectoryEvaluator.getMetricInfo).toBeTypeOf("function");
		expect(evaluation.RougeEvaluator.getMetricInfo).toBeTypeOf("function");
		expect(evaluation.FinalResponseMatchV2Evaluator.getMetricInfo).toBeTypeOf(
			"function",
		);
		expect(evaluation.SafetyEvaluatorV1.getMetricInfo).toBeTypeOf("function");
	});

	it("exposes AgentEvaluator and LocalEvalService as constructible exports", () => {
		expect(evaluation.AgentEvaluator.prototype).toBeDefined();
		expect(evaluation.LocalEvalService.prototype).toBeDefined();
	});

	it("EvalStatus enum has exactly three members", () => {
		const values = Object.values(evaluation.EvalStatus).filter(
			(v) => typeof v === "number",
		);
		expect(values).toHaveLength(3);
	});
});
