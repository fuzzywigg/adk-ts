import { describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { RougeEvaluator } from "../../evaluation/final-response-match-v1";
import { FinalResponseMatchV2Evaluator } from "../../evaluation/final-response-match-v2";
import { Label } from "../../evaluation/llm-as-judge-utils";

function invocation(text?: string): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse:
			text !== undefined ? { role: "model", parts: [{ text }] } : undefined,
	};
}

describe("final-response-match seventh leftover edges (post #158)", () => {
	it("RougeEvaluator v1 length mismatch throws on expected.finalResponse", async () => {
		const evaluator = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});

		await expect(
			evaluator.evaluateInvocations([invocation("only-actual")], []),
		).rejects.toThrow();
	});

	it("FinalResponseMatchV2 longer actual than expected throws on expected.userContent", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "stub", numSamples: 1 },
			},
			{ sampleJudge } as any,
		);

		await expect(
			evaluator.evaluateInvocations(
				[invocation("a"), invocation("b")],
				[invocation("only")],
			),
		).rejects.toThrow();
	});

	it("FinalResponseMatchV2 empty labels → NaN per-invocation score and FAILED", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "stub", numSamples: 3 },
			},
			{ sampleJudge } as any,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("actual")],
			[invocation("golden")],
		);

		expect(Number.isNaN(result.overallScore as number)).toBe(true);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		expect(result.perInvocationResults).toHaveLength(1);
		expect(Number.isNaN(result.perInvocationResults[0].score as number)).toBe(
			true,
		);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
	});

	it("FinalResponseMatchV2 missing expected content still samples judge with empty golden", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "stub", numSamples: 1 },
			},
			{ sampleJudge } as any,
		);

		const expected: Invocation = {
			userContent: { parts: [{ text: "prompt" }] },
			creationTimestamp: 1,
			finalResponse: undefined,
		};

		const result = await evaluator.evaluateInvocations(
			[invocation("actual")],
			[expected],
		);

		expect(sampleJudge).toHaveBeenCalled();
		const prompt = sampleJudge.mock.calls[0][0] as string;
		expect(prompt).toContain("prompt");
		expect(prompt).toContain("actual");
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});
});
