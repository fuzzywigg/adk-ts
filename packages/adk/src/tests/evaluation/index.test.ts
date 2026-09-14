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
});
