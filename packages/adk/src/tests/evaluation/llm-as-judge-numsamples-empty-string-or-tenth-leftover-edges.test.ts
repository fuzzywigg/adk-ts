import { afterEach, describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import type {
	EvaluationResult,
	PerInvocationResult,
} from "../../evaluation/evaluator";
import { EvalStatus } from "../../evaluation/evaluator";
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
			`${actual?.userContent?.parts?.[0]?.text ?? "a"}|${expected?.userContent?.parts?.[0]?.text ?? "b"}`,
	);

	convertAutoRaterResponseToScore = vi.fn((_response: LlmResponse) => 1);

	aggregatePerInvocationSamples = vi.fn(
		(samples: PerInvocationResult[]) => samples[0],
	);

	aggregateInvocationResults = vi.fn(
		(results: PerInvocationResult[]): EvaluationResult => ({
			overallScore: 1,
			overallEvalStatus: EvalStatus.PASSED,
			perInvocationResults: results,
		}),
	);
}

/**
 * Tenth leftover: numSamples || 5 — 0/null/undefined covered; "" / false → 5 not.
 */
describe("llm-as-judge numSamples empty-string-or tenth leftover edges", () => {
	it.each([
		{ label: "empty string", numSamples: "" as any, expectedCalls: 5 },
		{ label: "false", numSamples: false as any, expectedCalls: 5 },
		{ label: "NaN", numSamples: Number.NaN, expectedCalls: 5 },
	])("numSamples $label coalesces via || 5 → $expectedCalls generateContent calls", async ({
		numSamples,
		expectedCalls,
	}) => {
		const generateContent = vi.fn().mockResolvedValue({ text: "high" });
		LLMRegistry.registerModel("judge", { generateContent } as never);
		const evaluator = new StubJudgeEvaluator({
			metricName: "judge",
			threshold: 0.5,
			judgeModelOptions: { judgeModel: "judge", numSamples },
		});
		await evaluator.evaluateInvocations([invocation("a")], [invocation("b")]);
		expect(generateContent).toHaveBeenCalledTimes(expectedCalls);
	});

	it("explicit truthy numSamples 3 still honored", async () => {
		const generateContent = vi.fn().mockResolvedValue({ text: "high" });
		LLMRegistry.registerModel("judge", { generateContent } as never);
		const evaluator = new StubJudgeEvaluator({
			metricName: "judge",
			threshold: 0.5,
			judgeModelOptions: { judgeModel: "judge", numSamples: 3 },
		});
		await evaluator.evaluateInvocations([invocation("a")], [invocation("b")]);
		expect(generateContent).toHaveBeenCalledTimes(3);
	});
});
