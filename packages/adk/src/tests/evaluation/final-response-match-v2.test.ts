import { describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { EvalStatus } from "../../evaluation/evaluator";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { FinalResponseMatchV2Evaluator } from "../../evaluation/final-response-match-v2";
import type { LlmAsJudge } from "../../evaluation/llm-as-judge";
import { Label } from "../../evaluation/llm-as-judge-utils";

function invocation(text?: string): Invocation {
	return {
		userContent: { parts: [{ text: "user prompt" }] },
		creationTimestamp: 1,
		finalResponse:
			text !== undefined ? { role: "model", parts: [{ text }] } : undefined,
	};
}

describe("FinalResponseMatchV2Evaluator", () => {
	it("exposes metric info", () => {
		const info = FinalResponseMatchV2Evaluator.getMetricInfo();
		expect(info.metricName).toBe(PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2);
		expect(info.metricValueInfo?.interval?.minValue).toBe(0);
		expect(info.metricValueInfo?.interval?.maxValue).toBe(1);
	});

	it("returns NOT_EVALUATED when actual invocations are empty", async () => {
		const sampleJudge = vi.fn();
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations([], []);
		expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		expect(result.perInvocationResults).toEqual([]);
		expect(sampleJudge).not.toHaveBeenCalled();
	});

	it("scores all-valid labels as 1 and PASSED", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID, Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("actual answer")],
			[invocation("golden answer")],
		);

		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[0].score).toBe(1);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
	});

	it("scores mixed valid/invalid labels fractionally", async () => {
		const sampleJudge = vi
			.fn()
			.mockResolvedValue([
				Label.VALID,
				Label.INVALID,
				Label.VALID,
				Label.INVALID,
			]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("actual")],
			[invocation("golden")],
		);

		expect(result.overallScore).toBe(0.5);
		expect(result.perInvocationResults[0].score).toBe(0.5);
	});

	it("passes numSamples from judgeModelOptions to sampleJudge", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const judgeModelOptions = {
			judgeModel: "fake-judge",
			numSamples: 3,
		};
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
				judgeModelOptions,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		await evaluator.evaluateInvocations(
			[invocation("actual")],
			[invocation("golden")],
		);

		expect(sampleJudge).toHaveBeenCalledTimes(1);
		expect(sampleJudge.mock.calls[0][1]).toBe(3);
		expect(sampleJudge.mock.calls[0][3]).toBe(judgeModelOptions);
	});

	it("marks status FAILED when score is below threshold", async () => {
		const sampleJudge = vi
			.fn()
			.mockResolvedValue([
				Label.VALID,
				Label.INVALID,
				Label.INVALID,
				Label.INVALID,
			]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("actual")],
			[invocation("golden")],
		);

		expect(result.overallScore).toBe(0.25);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
	});

	it("marks status PASSED when score meets threshold", async () => {
		const sampleJudge = vi
			.fn()
			.mockResolvedValue([Label.VALID, Label.VALID, Label.INVALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.6,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("actual")],
			[invocation("golden")],
		);

		expect(result.overallScore).toBeCloseTo(2 / 3);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});
});
