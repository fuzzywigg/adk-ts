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

describe("LlmAsJudge.sampleJudge", () => {
	it("collects parsed labels and skips NOT_FOUND", async () => {
		const generateContent = vi
			.fn()
			.mockResolvedValueOnce({ text: "valid" })
			.mockResolvedValueOnce({ text: "skip" })
			.mockResolvedValueOnce({ text: "invalid" });

		LLMRegistry.registerModel("judge-model", {
			generateContent,
		} as any);

		const judge = new LlmAsJudge();
		const labels = await judge.sampleJudge(
			"rate this",
			3,
			(response) => {
				if (response === "valid") return Label.VALID;
				if (response === "invalid") return Label.INVALID;
				return Label.NOT_FOUND;
			},
			{ judgeModel: "judge-model", numSamples: 3 },
		);

		expect(generateContent).toHaveBeenCalledTimes(3);
		expect(labels).toEqual([Label.VALID, Label.INVALID]);
	});

	it("swallows per-sample errors and continues", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const generateContent = vi
			.fn()
			.mockRejectedValueOnce(new Error("boom"))
			.mockResolvedValueOnce({ text: "ok" });

		LLMRegistry.registerModel("judge-model", {
			generateContent,
		} as any);

		const judge = new LlmAsJudge();
		const labels = await judge.sampleJudge("prompt", 2, () => Label.VALID, {
			judgeModel: "judge-model",
		});

		expect(labels).toEqual([Label.VALID]);
		expect(console.error).toHaveBeenCalled();
	});

	it("defaults to gemini-2.5-flash when judgeModel is omitted", async () => {
		const generateContent = vi.fn().mockResolvedValue({ text: "x" });
		LLMRegistry.registerModel("gemini-2.5-flash", {
			generateContent,
		} as any);

		const judge = new LlmAsJudge();
		await judge.sampleJudge("p", 1, () => Label.VALID);

		expect(generateContent).toHaveBeenCalledWith(
			expect.objectContaining({ prompt: "p" }),
		);
	});

	it("spreads judgeModelConfig into generateContent", async () => {
		const generateContent = vi.fn().mockResolvedValue({ text: "ok" });
		LLMRegistry.registerModel("judge-model", {
			generateContent,
		} as any);

		const judge = new LlmAsJudge();
		await judge.sampleJudge("rate", 1, () => Label.VALID, {
			judgeModel: "judge-model",
			judgeModelConfig: { temperature: 0.1, maxOutputTokens: 64 },
		});

		expect(generateContent).toHaveBeenCalledWith({
			prompt: "rate",
			temperature: 0.1,
			maxOutputTokens: 64,
		});
	});

	it("returns an empty label list when every sample fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		LLMRegistry.registerModel("judge-model", {
			generateContent: vi.fn().mockRejectedValue(new Error("offline")),
		} as any);

		const judge = new LlmAsJudge();
		const labels = await judge.sampleJudge("p", 3, () => Label.VALID, {
			judgeModel: "judge-model",
		});

		expect(labels).toEqual([]);
		expect(console.error).toHaveBeenCalledTimes(3);
	});
});

describe("LlmAsJudgeEvaluator", () => {
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

	it("requires judgeModelOptions in the metric", () => {
		const metric: EvalMetric = {
			metricName: "judge",
			threshold: 0.5,
		};
		expect(() => new StubJudgeEvaluator(metric)).toThrow(
			"Judge model options is required for LlmAsJudge.",
		);
	});

	it("scores invocations from majority VALID labels", async () => {
		const generateContent = vi
			.fn()
			.mockResolvedValueOnce({ text: "high" })
			.mockResolvedValueOnce({ text: "high" })
			.mockResolvedValueOnce({ text: "low" });

		LLMRegistry.registerModel("judge-model", {
			generateContent,
		} as any);

		const evaluator = new StubJudgeEvaluator({
			metricName: "judge",
			threshold: 0.5,
			judgeModelOptions: {
				judgeModel: "judge-model",
				numSamples: 3,
			},
		});

		const actual = invocation("a");
		const expected = invocation("b");
		const result = await evaluator.evaluateInvocations([actual], [expected]);

		expect(evaluator.formatAutoRaterPrompt).toHaveBeenCalledWith(
			actual,
			expected,
		);
		expect(result.perInvocationResults).toHaveLength(1);
		expect(result.perInvocationResults[0].score).toBeCloseTo(2 / 3);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("skips invocations when no labels are collected", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		LLMRegistry.registerModel("judge-model", {
			generateContent: vi.fn().mockRejectedValue(new Error("down")),
		} as any);

		const evaluator = new StubJudgeEvaluator({
			metricName: "judge",
			threshold: 0.8,
			judgeModelOptions: {
				judgeModel: "judge-model",
				numSamples: 2,
			},
		});

		const result = await evaluator.evaluateInvocations(
			[invocation("a")],
			[invocation("b")],
		);

		expect(result.perInvocationResults).toEqual([]);
		expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
	});

	it("defaults numSamples to 5 when omitted from judgeModelOptions", async () => {
		const generateContent = vi.fn().mockResolvedValue({ text: "high" });
		LLMRegistry.registerModel("judge-model", {
			generateContent,
		} as any);

		const evaluator = new StubJudgeEvaluator({
			metricName: "judge",
			threshold: 0.5,
			judgeModelOptions: {
				judgeModel: "judge-model",
			},
		});

		await evaluator.evaluateInvocations([invocation("a")], [invocation("b")]);
		expect(generateContent).toHaveBeenCalledTimes(5);
	});

	it("treats undefined convertAutoRaterResponseToScore as INVALID", async () => {
		const generateContent = vi
			.fn()
			.mockResolvedValueOnce({ text: "unknown" })
			.mockResolvedValueOnce({ text: "high" });
		LLMRegistry.registerModel("judge-model", {
			generateContent,
		} as any);

		const evaluator = new StubJudgeEvaluator({
			metricName: "judge",
			threshold: 0.5,
			judgeModelOptions: {
				judgeModel: "judge-model",
				numSamples: 2,
			},
		});

		const result = await evaluator.evaluateInvocations(
			[invocation("a")],
			[invocation("b")],
		);

		expect(result.perInvocationResults[0].score).toBe(0.5);
		expect(evaluator.convertAutoRaterResponseToScore).toHaveBeenCalled();
	});

	it("marks majority INVALID labels as FAILED", async () => {
		const generateContent = vi
			.fn()
			.mockResolvedValueOnce({ text: "low" })
			.mockResolvedValueOnce({ text: "low" })
			.mockResolvedValueOnce({ text: "high" });
		LLMRegistry.registerModel("judge-model", {
			generateContent,
		} as any);

		const evaluator = new StubJudgeEvaluator({
			metricName: "judge",
			threshold: 0.5,
			judgeModelOptions: {
				judgeModel: "judge-model",
				numSamples: 3,
			},
		});

		const result = await evaluator.evaluateInvocations(
			[invocation("a")],
			[invocation("b")],
		);

		expect(result.perInvocationResults[0].score).toBeCloseTo(1 / 3);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
	});

	it("aggregates scores across multiple invocations", async () => {
		const generateContent = vi
			.fn()
			.mockResolvedValueOnce({ text: "high" })
			.mockResolvedValueOnce({ text: "low" });
		LLMRegistry.registerModel("judge-model", {
			generateContent,
		} as any);

		const evaluator = new StubJudgeEvaluator({
			metricName: "judge",
			threshold: 0.5,
			judgeModelOptions: {
				judgeModel: "judge-model",
				numSamples: 1,
			},
		});

		const result = await evaluator.evaluateInvocations(
			[invocation("a1"), invocation("a2")],
			[invocation("b1"), invocation("b2")],
		);

		expect(result.perInvocationResults).toHaveLength(2);
		expect(result.perInvocationResults[0].score).toBe(1);
		expect(result.perInvocationResults[1].score).toBe(0);
		expect(result.overallScore).toBe(0.5);
		expect(evaluator.formatAutoRaterPrompt).toHaveBeenCalledTimes(2);
	});
});
