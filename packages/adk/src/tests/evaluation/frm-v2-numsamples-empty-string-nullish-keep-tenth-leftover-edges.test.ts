import { describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { FinalResponseMatchV2Evaluator } from "../../evaluation/final-response-match-v2";
import type { LlmAsJudge } from "../../evaluation/llm-as-judge";
import { Label } from "../../evaluation/llm-as-judge-utils";

function invocation(text: string): Invocation {
	return {
		userContent: { parts: [{ text: "q" }] },
		creationTimestamp: 1,
		finalResponse: { role: "model", parts: [{ text }] },
	};
}

/**
 * Tenth leftover: FinalResponseMatchV2 uses `numSamples ?? 5` while
 * LlmAsJudgeEvaluator uses `numSamples || 5`. Empty string / false / NaN are
 * kept here (not coalesced to 5). Companion to llm-as-judge tenth leftover.
 */
describe("frm-v2 numSamples empty-string ?? keep tenth leftover edges", () => {
	it.each([
		{ label: "empty string", numSamples: "" as any },
		{ label: "false", numSamples: false as any },
		{ label: "NaN", numSamples: Number.NaN },
	])("numSamples $label is forwarded via ?? (not 5)", async ({
		numSamples,
	}) => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "fake", numSamples },
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);
		await evaluator.evaluateInvocations(
			[invocation("actual")],
			[invocation("golden")],
		);
		expect(sampleJudge.mock.calls[0][1]).toBe(numSamples);
		expect(sampleJudge.mock.calls[0][1]).not.toBe(5);
	});

	it("undefined numSamples still defaults to 5 (control)", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "fake" },
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);
		await evaluator.evaluateInvocations([invocation("a")], [invocation("g")]);
		expect(sampleJudge.mock.calls[0][1]).toBe(5);
	});

	it("explicit 0 is kept via ?? (control from leftover matrix)", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "fake", numSamples: 0 },
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);
		await evaluator.evaluateInvocations([invocation("a")], [invocation("g")]);
		expect(sampleJudge.mock.calls[0][1]).toBe(0);
	});
});
