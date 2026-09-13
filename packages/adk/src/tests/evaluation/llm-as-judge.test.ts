import { afterEach, describe, expect, it, vi } from "vitest";
import { LLMRegistry } from "../../models/llm-registry";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import {
	EvalStatus,
	type EvaluationResult,
	type PerInvocationResult,
} from "../../evaluation/evaluator";
import { Label } from "../../evaluation/llm-as-judge-utils";
import { LlmAsJudge, LlmAsJudgeEvaluator } from "../../evaluation/llm-as-judge";
import { LlmResponse } from "../../models/llm-response";

afterEach(() => {
	LLMRegistry.clear();
});

function invocation(text: string): Invocation {
	return {
		userContent: { parts: [{ text: "q" }] },
		creationTimestamp: 1,
		finalResponse: { role: "model", parts: [{ text }] },
	};
}

class StubJudgeEvaluator extends LlmAsJudgeEvaluator {
	formatAutoRaterPrompt(actual: Invocation, expected: Invocation): string {
		return `actual=${actual.finalResponse?.parts?.[0]?.text};expected=${expected.finalResponse?.parts?.[0]?.text}`;
	}

	convertAutoRaterResponseToScore(
		autoRaterResponse: LlmResponse,
	): number | undefined {
		const text = autoRaterResponse.text;
		if (text === "pass") return 1;
		if (text === "fail") return 0;
		return undefined;
	}

	aggregatePerInvocationSamples(
		perInvocationSamples: PerInvocationResult[],
	): PerInvocationResult {
		return perInvocationSamples[0];
	}

	aggregateInvocationResults(
		perInvocationResults: PerInvocationResult[],
	): EvaluationResult {
		const score =
			perInvocationResults.reduce((sum, r) => sum + (r.score || 0), 0) /
			(perInvocationResults.length || 1);
		return {
			overallScore: score,
			overallEvalStatus:
				score >= this.metric.threshold ? EvalStatus.PASSED : EvalStatus.FAILED,
			perInvocationResults,
		};
	}
}

describe("LlmAsJudge", () => {
	it("samples labels and filters NOT_FOUND", async () => {
		LLMRegistry.registerModel("fake-judge", {
			async generateContent() {
				return { text: "VALID" } as any;
			},
		});

		const judge = new LlmAsJudge();
		const labels = await judge.sampleJudge(
			"prompt",
			3,
			(response) => (response === "VALID" ? Label.VALID : Label.NOT_FOUND),
			{ judgeModel: "fake-judge", numSamples: 3 },
		);

		expect(labels).toEqual([Label.VALID, Label.VALID, Label.VALID]);
	});

	it("swallows per-sample errors and continues", async () => {
		let calls = 0;
		LLMRegistry.registerModel("flaky-judge", {
			async generateContent() {
				calls += 1;
				if (calls === 1) throw new Error("transient");
				return { text: "ok" } as any;
			},
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const judge = new LlmAsJudge();
		const labels = await judge.sampleJudge("prompt", 2, () => Label.INVALID, {
			judgeModel: "flaky-judge",
		});

		expect(labels).toEqual([Label.INVALID]);
		expect(errorSpy).toHaveBeenCalled();
		errorSpy.mockRestore();
	});
});

describe("LlmAsJudgeEvaluator", () => {
	it("requires judgeModelOptions", () => {
		expect(
			() =>
				new StubJudgeEvaluator({
					metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
					threshold: 0.5,
				}),
		).toThrow("Judge model options is required");
	});

	it("aggregates sample labels into per-invocation scores", async () => {
		LLMRegistry.registerModel("stub-judge", {
			async generateContent({ prompt }: { prompt: string }) {
				return {
					text: prompt.includes("good") ? "pass" : "fail",
				} as any;
			},
		});

		const evaluator = new StubJudgeEvaluator({
			metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
			threshold: 0.5,
			judgeModelOptions: {
				judgeModel: "stub-judge",
				numSamples: 2,
			},
		});

		const result = await evaluator.evaluateInvocations(
			[invocation("good"), invocation("bad")],
			[invocation("ref-a"), invocation("ref-b")],
		);

		expect(result.perInvocationResults).toHaveLength(2);
		expect(result.perInvocationResults[0].score).toBe(1);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[1].score).toBe(0);
		expect(result.perInvocationResults[1].evalStatus).toBe(EvalStatus.FAILED);
		expect(result.overallScore).toBe(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});
});
