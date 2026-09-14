import { afterEach, describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import type { EvalMetric } from "../../evaluation/eval-metrics";
import {
	EvalStatus,
	type EvaluationResult,
	type PerInvocationResult,
} from "../../evaluation/evaluator";
import { LlmAsJudge, LlmAsJudgeEvaluator } from "../../evaluation/llm-as-judge";
import { Label } from "../../evaluation/llm-as-judge-utils";
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
			`${actual?.userContent?.parts?.[0]?.text ?? "a"}|${expected?.userContent?.parts?.[0]?.text ?? "e"}`,
	);

	convertAutoRaterResponseToScore = vi.fn((response: LlmResponse) => {
		const text = response.text || "";
		if (text.includes("high")) return 1;
		return 0;
	});

	aggregatePerInvocationSamples = vi.fn(
		(samples: PerInvocationResult[]) => samples[0],
	);

	aggregateInvocationResults = vi.fn(
		(results: PerInvocationResult[]): EvaluationResult => ({
			overallScore: results[0]?.score,
			overallEvalStatus: results[0]?.evalStatus ?? EvalStatus.NOT_EVALUATED,
			perInvocationResults: results,
		}),
	);
}

describe("LlmAsJudge seventh leftover edges (post #158)", () => {
	it("sampleJudge continues when critiqueParser throws", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const model = {
			generateContent: vi
				.fn()
				.mockResolvedValueOnce({ text: "bad" })
				.mockResolvedValueOnce({ text: "ok" }),
		};
		vi.spyOn(LLMRegistry, "getModelOrCreate").mockReturnValue(model as any);

		const judge = new LlmAsJudge();
		let calls = 0;
		const labels = await judge.sampleJudge("p", 2, () => {
			calls += 1;
			if (calls === 1) throw new Error("parse-fail");
			return Label.VALID;
		});

		expect(labels).toEqual([Label.VALID]);
		expect(errorSpy).toHaveBeenCalledWith(
			"Error sampling judge model:",
			expect.any(Error),
		);
	});

	it("sampleJudge passes undefined text to critiqueParser when response.text missing", async () => {
		vi.spyOn(LLMRegistry, "getModelOrCreate").mockReturnValue({
			generateContent: vi.fn().mockResolvedValue({}),
		} as any);

		const judge = new LlmAsJudge();
		const seen: unknown[] = [];
		const labels = await judge.sampleJudge("p", 1, (text) => {
			seen.push(text);
			return Label.VALID;
		});

		expect(seen).toEqual([undefined]);
		expect(labels).toEqual([Label.VALID]);
	});

	it("sampleJudge with text:undefined still invokes critiqueParser", async () => {
		vi.spyOn(LLMRegistry, "getModelOrCreate").mockReturnValue({
			generateContent: vi.fn().mockResolvedValue({ text: undefined }),
		} as any);

		const judge = new LlmAsJudge();
		const labels = await judge.sampleJudge("p", 1, (text) => {
			expect(text).toBeUndefined();
			return Label.INVALID;
		});
		expect(labels).toEqual([Label.INVALID]);
	});

	it("LlmAsJudgeEvaluator.evaluateInvocations never calls aggregatePerInvocationSamples", async () => {
		vi.spyOn(LLMRegistry, "getModelOrCreate").mockReturnValue({
			generateContent: vi.fn().mockResolvedValue({ text: "high" }),
		} as any);

		const metric: EvalMetric = {
			metricName: "stub",
			threshold: 0.5,
			judgeModelOptions: { judgeModel: "stub-model", numSamples: 1 },
		};
		const evaluator = new StubJudgeEvaluator(metric);
		await evaluator.evaluateInvocations([invocation("a")], [invocation("e")]);

		expect(evaluator.aggregatePerInvocationSamples).not.toHaveBeenCalled();
		expect(evaluator.aggregateInvocationResults).toHaveBeenCalled();
	});
});
