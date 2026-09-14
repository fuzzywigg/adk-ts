import { afterEach, describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import type { EvalMetric } from "../../evaluation/eval-metrics";
import {
	EvalStatus,
	type EvaluationResult,
	type PerInvocationResult,
} from "../../evaluation/evaluator";
import { LlmAsJudgeEvaluator } from "../../evaluation/llm-as-judge";
import { LLMRegistry } from "../../models/llm-registry";
import { LlmResponse } from "../../models/llm-response";

afterEach(() => {
	LLMRegistry.clear();
	vi.restoreAllMocks();
});

function invocation(text: string): Invocation {
	return {
		userContent: { parts: [{ text }] },
		creationTimestamp: 1,
	};
}

class StubJudgeEvaluator extends LlmAsJudgeEvaluator {
	formatAutoRaterPrompt = vi.fn(
		(actual: Invocation, expected: Invocation) =>
			`${actual.userContent?.parts?.[0]?.text}|${expected.userContent?.parts?.[0]?.text}`,
	);

	convertAutoRaterResponseToScore = vi.fn((response: LlmResponse) => {
		const text = response.text || "";
		if (text.includes("high")) return 1;
		if (text.includes("low")) return 0;
		return undefined;
	});

	aggregatePerInvocationSamples = vi.fn(
		(samples: PerInvocationResult[]) => samples[0],
	);

	aggregateInvocationResults = vi.fn(
		(results: PerInvocationResult[]): EvaluationResult => ({
			overallScore:
				results.reduce((sum, r) => sum + (r.score || 0), 0) /
				Math.max(results.length, 1),
			overallEvalStatus:
				results.length > 0 ? EvalStatus.PASSED : EvalStatus.NOT_EVALUATED,
			perInvocationResults: results,
		}),
	);
}

describe("LlmAsJudge leftover edges (TOKENMAXX post #124)", () => {
	it("coerces numSamples 0 to default 5 via falsy ||", async () => {
		const generateContent = vi.fn().mockResolvedValue({ text: "high" });
		LLMRegistry.registerModel("judge-model", {
			generateContent,
		} as any);

		const metric: EvalMetric = {
			metricName: "judge",
			threshold: 0.5,
			judgeModelOptions: {
				judgeModel: "judge-model",
				numSamples: 0,
			},
		};
		const evaluator = new StubJudgeEvaluator(metric);

		await evaluator.evaluateInvocations([invocation("a")], [invocation("b")]);
		expect(generateContent).toHaveBeenCalledTimes(5);
	});
});
