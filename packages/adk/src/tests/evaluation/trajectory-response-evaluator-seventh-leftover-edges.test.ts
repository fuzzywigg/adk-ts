import { describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { ResponseEvaluator } from "../../evaluation/response-evaluator";
import { TrajectoryEvaluator } from "../../evaluation/trajectory-evaluator";
import { VertexAiEvalFacade } from "../../evaluation/vertex-ai-eval-facade";

function trajInv(toolUses: any): Invocation {
	return {
		userContent: { parts: [{ text: "q" }] },
		creationTimestamp: 1,
		intermediateData: { toolUses, intermediateResponses: [] },
	};
}

function respInv(finalResponse: any): Invocation {
	return {
		userContent: { parts: [{ text: "q" }] },
		creationTimestamp: 1,
		finalResponse,
	};
}

describe("Trajectory + ResponseEvaluator seventh leftover edges (post #158)", () => {
	it("trajectory treats toolUses: null as NOT_EVALUATED (distinct from [])", async () => {
		const evaluator = new TrajectoryEvaluator({
			metricName: PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
			threshold: 1,
		});

		const result = await evaluator.evaluateInvocations(
			[trajInv(null)],
			[trajInv([{ name: "t", args: {} }])],
		);

		expect(result.perInvocationResults[0].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
		expect(result.perInvocationResults[0].score).toBeUndefined();
	});

	it("trajectory empty toolUses arrays still evaluate as equal PASSED", async () => {
		const evaluator = new TrajectoryEvaluator({
			metricName: PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
			threshold: 1,
		});

		const result = await evaluator.evaluateInvocations(
			[trajInv([])],
			[trajInv([])],
		);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[0].score).toBe(1);
	});

	it("trajectory longer actual than expected throws (expected.intermediateData without ?.)", async () => {
		const evaluator = new TrajectoryEvaluator({
			metricName: PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
			threshold: 1,
		});

		await expect(
			evaluator.evaluateInvocations(
				[
					trajInv([{ name: "t", args: {} }]),
					trajInv([{ name: "u", args: {} }]),
				],
				[trajInv([{ name: "t", args: {} }])],
			),
		).rejects.toThrow();
	});

	it("response rouge: present finalResponse with parts:[] scores 0 FAILED (not NOT_EVALUATED)", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});

		const result = await evaluator.evaluateInvocations(
			[respInv({ role: "model", parts: [] })],
			[respInv({ role: "model", parts: [{ text: "golden" }] })],
		);

		expect(result.perInvocationResults[0].score).toBe(0);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
	});

	it("response rouge: missing finalResponse → NOT_EVALUATED", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});

		const result = await evaluator.evaluateInvocations(
			[respInv(undefined)],
			[respInv({ role: "model", parts: [{ text: "golden" }] })],
		);

		expect(result.perInvocationResults[0].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
	});

	it("response rouge: all NOT_EVALUATED + threshold 0 → overall FAILED (undefined score)", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0,
		});

		const result = await evaluator.evaluateInvocations(
			[respInv(undefined)],
			[respInv(undefined)],
		);

		expect(result.overallScore).toBeUndefined();
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("response evaluation score delegates to VertexAiEvalFacade", async () => {
		const spy = vi
			.spyOn(VertexAiEvalFacade.prototype, "evaluateInvocations")
			.mockResolvedValue({
				overallScore: 4,
				overallEvalStatus: EvalStatus.PASSED,
				perInvocationResults: [],
			});

		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
			threshold: 3,
		});

		const result = await evaluator.evaluateInvocations(
			[respInv({ parts: [{ text: "a" }] })],
			[respInv({ parts: [{ text: "b" }] })],
		);

		expect(spy).toHaveBeenCalled();
		expect(result.overallScore).toBe(4);
	});
});
