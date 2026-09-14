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
			`${actual?.userContent?.parts?.[0]?.text ?? "missing-actual"}|${expected?.userContent?.parts?.[0]?.text ?? "missing-expected"}`,
	);

	convertAutoRaterResponseToScore = vi.fn((response: LlmResponse) => {
		const text = response.text || "";
		if (text.includes("high")) return 1;
		if (text.includes("mid")) return 0.5;
		if (text.includes("low")) return 0;
		return undefined;
	});

	aggregatePerInvocationSamples = vi.fn(
		(samples: PerInvocationResult[]) => samples[0],
	);

	aggregateInvocationResults = vi.fn(
		(results: PerInvocationResult[]): EvaluationResult => ({
			overallScore:
				results.length === 0
					? undefined
					: results.reduce((sum, r) => sum + (r.score || 0), 0) /
						Math.max(results.length, 1),
			overallEvalStatus:
				results.length > 0 ? EvalStatus.PASSED : EvalStatus.NOT_EVALUATED,
			perInvocationResults: results,
		}),
	);
}

describe("LlmAsJudge leftover matrix edges", () => {
	describe("combinatorial judgeModel × config × samples", () => {
		it.each([
			{
				judgeModel: undefined,
				registered: "gemini-2.5-flash",
				config: undefined,
				samples: 2,
			},
			{
				judgeModel: "",
				registered: "gemini-2.5-flash",
				config: undefined,
				samples: 1,
			},
			{
				judgeModel: "custom-a",
				registered: "custom-a",
				config: {},
				samples: 3,
			},
			{
				judgeModel: "custom-b",
				registered: "custom-b",
				config: { temperature: 0 },
				samples: 2,
			},
			{
				judgeModel: "custom-c",
				registered: "custom-c",
				config: { temperature: 0.2, topP: 0.8 },
				samples: 1,
			},
		])("model=$judgeModel samples=$samples config=$config", async ({
			judgeModel,
			registered,
			config,
			samples,
		}) => {
			const generateContent = vi.fn().mockResolvedValue({ text: "ok" });
			LLMRegistry.registerModel(registered, {
				generateContent,
			} as never);
			const judge = new LlmAsJudge();
			const options: any = {};
			if (judgeModel !== undefined) options.judgeModel = judgeModel;
			if (config !== undefined) options.judgeModelConfig = config;

			const labels = await judge.sampleJudge(
				"prompt-x",
				samples,
				() => Label.VALID,
				Object.keys(options).length ? options : undefined,
			);

			expect(generateContent).toHaveBeenCalledTimes(samples);
			expect(labels).toHaveLength(samples);
			const callArg = generateContent.mock.calls[0][0];
			expect(callArg.prompt).toBe("prompt-x");
			if (config && Object.keys(config).length) {
				for (const [k, v] of Object.entries(config)) {
					expect(callArg[k]).toBe(v);
				}
			}
		});
	});

	describe("Label parsing leftovers via critiqueParser", () => {
		it.each([
			{ text: "valid", label: Label.VALID },
			{ text: "invalid", label: Label.INVALID },
			{ text: "not_found", label: Label.NOT_FOUND },
			{ text: "", label: Label.NOT_FOUND },
			{ text: "VALID", label: Label.NOT_FOUND },
			{ text: "other", label: Label.NOT_FOUND },
		])("maps $text → keeps only non-NOT_FOUND", async ({ text, label }) => {
			const generateContent = vi.fn().mockResolvedValue({ text });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const judge = new LlmAsJudge();
			const labels = await judge.sampleJudge(
				"p",
				1,
				(raw) => {
					if (raw === "valid") return Label.VALID;
					if (raw === "invalid") return Label.INVALID;
					return Label.NOT_FOUND;
				},
				{ judgeModel: "judge" },
			);
			expect(labels).toEqual(label === Label.NOT_FOUND ? [] : [label]);
		});

		it("mixes VALID/INVALID/NOT_FOUND across a sample batch", async () => {
			const generateContent = vi
				.fn()
				.mockResolvedValueOnce({ text: "v" })
				.mockResolvedValueOnce({ text: "n" })
				.mockResolvedValueOnce({ text: "i" })
				.mockResolvedValueOnce({ text: "n2" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const judge = new LlmAsJudge();
			const labels = await judge.sampleJudge(
				"p",
				4,
				(t) => {
					if (t === "v") return Label.VALID;
					if (t === "i") return Label.INVALID;
					return Label.NOT_FOUND;
				},
				{ judgeModel: "judge" },
			);
			expect(labels).toEqual([Label.VALID, Label.INVALID]);
		});
	});

	describe("numSamples || 5 with 0→5 in evaluateInvocations", () => {
		it.each([
			{ numSamples: undefined, expectedCalls: 5 },
			{ numSamples: 0, expectedCalls: 5 },
			{ numSamples: null as unknown as number, expectedCalls: 5 },
			{ numSamples: 1, expectedCalls: 1 },
			{ numSamples: 2, expectedCalls: 2 },
			{ numSamples: 4, expectedCalls: 4 },
		])("numSamples=$numSamples → $expectedCalls generateContent calls", async ({
			numSamples,
			expectedCalls,
		}) => {
			const generateContent = vi.fn().mockResolvedValue({ text: "high" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const options: any = { judgeModel: "judge" };
			if (numSamples !== undefined) options.numSamples = numSamples;
			const evaluator = new StubJudgeEvaluator({
				metricName: "judge",
				threshold: 0.5,
				judgeModelOptions: options,
			});
			await evaluator.evaluateInvocations([invocation("a")], [invocation("b")]);
			expect(generateContent).toHaveBeenCalledTimes(expectedCalls);
		});
	});

	describe("evaluateInvocations empty / mismatch lengths", () => {
		it("empty actual list aggregates to NOT_EVALUATED", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "high" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const evaluator = new StubJudgeEvaluator({
				metricName: "judge",
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "judge", numSamples: 1 },
			});
			const result = await evaluator.evaluateInvocations([], []);
			expect(generateContent).not.toHaveBeenCalled();
			expect(result.perInvocationResults).toEqual([]);
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		});

		it("skips rows when labels stay empty after all sample failures", async () => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			LLMRegistry.registerModel("judge", {
				generateContent: vi.fn().mockRejectedValue("down"),
			} as never);
			const evaluator = new StubJudgeEvaluator({
				metricName: "judge",
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "judge", numSamples: 2 },
			});
			const result = await evaluator.evaluateInvocations(
				[invocation("a"), invocation("c")],
				[invocation("b"), invocation("d")],
			);
			expect(result.perInvocationResults).toEqual([]);
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		});

		it("longer actual than expected still iterates actual length with missing expected", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "high" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const evaluator = new StubJudgeEvaluator({
				metricName: "judge",
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "judge", numSamples: 1 },
			});
			const result = await evaluator.evaluateInvocations(
				[invocation("a"), invocation("extra")],
				[invocation("b")],
			);
			expect(evaluator.formatAutoRaterPrompt).toHaveBeenCalledTimes(2);
			expect(evaluator.formatAutoRaterPrompt.mock.calls[1][1]).toBeUndefined();
			expect(result.perInvocationResults).toHaveLength(2);
			expect(generateContent).toHaveBeenCalledTimes(2);
		});

		it("shorter actual than expected only evaluates actual length", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "high" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const evaluator = new StubJudgeEvaluator({
				metricName: "judge",
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "judge", numSamples: 1 },
			});
			const result = await evaluator.evaluateInvocations(
				[invocation("a")],
				[invocation("b"), invocation("unused")],
			);
			expect(evaluator.formatAutoRaterPrompt).toHaveBeenCalledTimes(1);
			expect(result.perInvocationResults).toHaveLength(1);
			expect(generateContent).toHaveBeenCalledTimes(1);
		});
	});

	describe("critiqueParser threshold × score matrix", () => {
		it.each([
			{ text: "high", threshold: 1, score: 1, status: EvalStatus.PASSED },
			{ text: "high", threshold: 1.1, score: 0, status: EvalStatus.FAILED },
			{ text: "mid", threshold: 0.5, score: 1, status: EvalStatus.PASSED },
			{ text: "mid", threshold: 0.51, score: 0, status: EvalStatus.FAILED },
			{ text: "low", threshold: 0, score: 1, status: EvalStatus.PASSED },
			{ text: "low", threshold: 0.01, score: 0, status: EvalStatus.FAILED },
		])("$text vs threshold $threshold → score=$score", async ({
			text,
			threshold,
			score,
			status,
		}) => {
			const generateContent = vi.fn().mockResolvedValue({ text });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const evaluator = new StubJudgeEvaluator({
				metricName: "judge",
				threshold,
				judgeModelOptions: { judgeModel: "judge", numSamples: 1 },
			});
			const result = await evaluator.evaluateInvocations(
				[invocation("a")],
				[invocation("b")],
			);
			expect(result.perInvocationResults[0].score).toBe(score);
			expect(result.perInvocationResults[0].evalStatus).toBe(status);
		});
	});

	describe("constructor guard leftovers", () => {
		it.each([
			{ judgeModelOptions: undefined },
			{ judgeModelOptions: null as any },
			{ judgeModelOptions: 0 as any },
			{ judgeModelOptions: "" as any },
		])("throws when judgeModelOptions is $judgeModelOptions", ({
			judgeModelOptions,
		}) => {
			const metric: EvalMetric = {
				metricName: "judge",
				threshold: 0.5,
				judgeModelOptions,
			};
			expect(() => new StubJudgeEvaluator(metric)).toThrow(
				"Judge model options is required for LlmAsJudge.",
			);
		});
	});
});
