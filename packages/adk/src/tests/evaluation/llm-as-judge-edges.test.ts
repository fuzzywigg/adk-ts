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

describe("LlmAsJudge.sampleJudge leftover edges", () => {
	describe("judgeModel || default", () => {
		it("uses gemini-2.5-flash when judgeModel is undefined", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "ok" });
			LLMRegistry.registerModel("gemini-2.5-flash", {
				generateContent,
			} as never);
			const judge = new LlmAsJudge();
			await judge.sampleJudge("prompt", 1, () => Label.VALID);
			expect(generateContent).toHaveBeenCalledOnce();
		});

		it("uses gemini-2.5-flash when judgeModelOptions is undefined", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "ok" });
			LLMRegistry.registerModel("gemini-2.5-flash", {
				generateContent,
			} as never);
			const judge = new LlmAsJudge();
			await judge.sampleJudge("p", 1, () => Label.VALID, undefined);
			expect(generateContent).toHaveBeenCalled();
		});

		it("uses explicit judgeModel when provided", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "ok" });
			LLMRegistry.registerModel("custom-judge", { generateContent } as never);
			const judge = new LlmAsJudge();
			await judge.sampleJudge("p", 1, () => Label.VALID, {
				judgeModel: "custom-judge",
			});
			expect(generateContent).toHaveBeenCalled();
		});

		it("falls back to default when judgeModel is empty string", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "ok" });
			LLMRegistry.registerModel("gemini-2.5-flash", {
				generateContent,
			} as never);
			const judge = new LlmAsJudge();
			await judge.sampleJudge("p", 1, () => Label.VALID, {
				judgeModel: "",
			});
			expect(generateContent).toHaveBeenCalled();
		});
	});

	describe("judgeModelConfig || {}", () => {
		it("spreads empty config when judgeModelConfig is undefined", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "ok" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const judge = new LlmAsJudge();
			await judge.sampleJudge("rate", 1, () => Label.VALID, {
				judgeModel: "judge",
			});
			expect(generateContent).toHaveBeenCalledWith({ prompt: "rate" });
		});

		it("spreads config fields when judgeModelConfig is provided", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "ok" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const judge = new LlmAsJudge();
			await judge.sampleJudge("rate", 1, () => Label.VALID, {
				judgeModel: "judge",
				judgeModelConfig: { temperature: 0, topP: 0.9 },
			});
			expect(generateContent).toHaveBeenCalledWith({
				prompt: "rate",
				temperature: 0,
				topP: 0.9,
			});
		});

		it("uses {} when judgeModelConfig is explicitly null via ||", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "ok" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const judge = new LlmAsJudge();
			await judge.sampleJudge("p", 1, () => Label.VALID, {
				judgeModel: "judge",
				judgeModelConfig: null as never,
			});
			expect(generateContent).toHaveBeenCalledWith({ prompt: "p" });
		});
	});

	describe("numSamples loop count", () => {
		it("runs exactly numSamples iterations when provided", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "ok" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const judge = new LlmAsJudge();
			await judge.sampleJudge("p", 7, () => Label.VALID, {
				judgeModel: "judge",
			});
			expect(generateContent).toHaveBeenCalledTimes(7);
		});

		it("runs zero iterations when numSamples is 0", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "ok" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const judge = new LlmAsJudge();
			const labels = await judge.sampleJudge("p", 0, () => Label.VALID, {
				judgeModel: "judge",
			});
			expect(generateContent).not.toHaveBeenCalled();
			expect(labels).toEqual([]);
		});

		it("runs one iteration when numSamples is 1", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "ok" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const judge = new LlmAsJudge();
			const labels = await judge.sampleJudge("p", 1, () => Label.VALID, {
				judgeModel: "judge",
			});
			expect(labels).toEqual([Label.VALID]);
		});
	});

	describe("catch path and error logging", () => {
		it("logs Error instances via console.error", async () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const generateContent = vi
				.fn()
				.mockRejectedValueOnce(new Error("network fail"))
				.mockResolvedValueOnce({ text: "ok" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const judge = new LlmAsJudge();
			const labels = await judge.sampleJudge("p", 2, () => Label.VALID, {
				judgeModel: "judge",
			});
			expect(labels).toEqual([Label.VALID]);
			expect(errorSpy).toHaveBeenCalledWith(
				"Error sampling judge model:",
				expect.any(Error),
			);
		});

		it("logs non-Error thrown values without String coercion in catch", async () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const generateContent = vi
				.fn()
				.mockRejectedValueOnce("plain string failure")
				.mockResolvedValueOnce({ text: "ok" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const judge = new LlmAsJudge();
			const labels = await judge.sampleJudge("p", 2, () => Label.VALID, {
				judgeModel: "judge",
			});
			expect(labels).toEqual([Label.VALID]);
			expect(errorSpy).toHaveBeenCalledWith(
				"Error sampling judge model:",
				"plain string failure",
			);
		});

		it("continues sampling after non-Error rejection", async () => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			const generateContent = vi
				.fn()
				.mockRejectedValueOnce({ code: 503 })
				.mockRejectedValueOnce(null)
				.mockResolvedValueOnce({ text: "ok" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const judge = new LlmAsJudge();
			const labels = await judge.sampleJudge("p", 3, () => Label.VALID, {
				judgeModel: "judge",
			});
			expect(labels).toEqual([Label.VALID]);
			expect(generateContent).toHaveBeenCalledTimes(3);
		});
	});

	describe("empty samples and NOT_FOUND filtering", () => {
		it("returns empty array when all samples throw", async () => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			LLMRegistry.registerModel("judge", {
				generateContent: vi.fn().mockRejectedValue("fail"),
			} as never);
			const judge = new LlmAsJudge();
			const labels = await judge.sampleJudge("p", 3, () => Label.VALID, {
				judgeModel: "judge",
			});
			expect(labels).toEqual([]);
		});

		it("skips NOT_FOUND labels without pushing to samples", async () => {
			const generateContent = vi
				.fn()
				.mockResolvedValueOnce({ text: "unparseable" })
				.mockResolvedValueOnce({ text: "good" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const judge = new LlmAsJudge();
			const labels = await judge.sampleJudge(
				"p",
				2,
				(text) => (text === "good" ? Label.VALID : Label.NOT_FOUND),
				{ judgeModel: "judge" },
			);
			expect(labels).toEqual([Label.VALID]);
		});

		it("collects only VALID and INVALID labels", async () => {
			const generateContent = vi
				.fn()
				.mockResolvedValueOnce({ text: "v" })
				.mockResolvedValueOnce({ text: "i" })
				.mockResolvedValueOnce({ text: "n" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const judge = new LlmAsJudge();
			const labels = await judge.sampleJudge(
				"p",
				3,
				(text) => {
					if (text === "v") return Label.VALID;
					if (text === "i") return Label.INVALID;
					return Label.NOT_FOUND;
				},
				{ judgeModel: "judge" },
			);
			expect(labels).toEqual([Label.VALID, Label.INVALID]);
		});
	});
});

describe("LlmAsJudgeEvaluator leftover edges", () => {
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

	describe("numSamples || 5 in evaluateInvocations", () => {
		it("defaults to 5 samples when numSamples is undefined in judgeModelOptions", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "high" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const evaluator = new StubJudgeEvaluator({
				metricName: "judge",
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "judge" },
			});
			await evaluator.evaluateInvocations([invocation("a")], [invocation("b")]);
			expect(generateContent).toHaveBeenCalledTimes(5);
		});

		it("treats numSamples 0 as falsy and defaults to 5 via ||", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "high" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const evaluator = new StubJudgeEvaluator({
				metricName: "judge",
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "judge", numSamples: 0 },
			});
			await evaluator.evaluateInvocations([invocation("a")], [invocation("b")]);
			expect(generateContent).toHaveBeenCalledTimes(5);
		});

		it("uses explicit numSamples when truthy", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "high" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const evaluator = new StubJudgeEvaluator({
				metricName: "judge",
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "judge", numSamples: 2 },
			});
			await evaluator.evaluateInvocations([invocation("a")], [invocation("b")]);
			expect(generateContent).toHaveBeenCalledTimes(2);
		});
	});

	describe("empty labels path in evaluateInvocations", () => {
		it("skips invocation when all samples fail and labels stay empty", async () => {
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
				[invocation("a")],
				[invocation("b")],
			);
			expect(result.perInvocationResults).toEqual([]);
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		});

		it("scores zero when convertAutoRaterResponseToScore returns undefined for all samples", async () => {
			const generateContent = vi
				.fn()
				.mockResolvedValue({ text: "unparseable" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const evaluator = new StubJudgeEvaluator({
				metricName: "judge",
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "judge", numSamples: 2 },
			});
			const result = await evaluator.evaluateInvocations(
				[invocation("a")],
				[invocation("b")],
			);
			expect(result.perInvocationResults).toHaveLength(1);
			expect(result.perInvocationResults[0].score).toBe(0);
			expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
		});
	});

	describe("critiqueParser threshold wiring", () => {
		it("maps score at threshold to VALID label", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "high" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const evaluator = new StubJudgeEvaluator({
				metricName: "judge",
				threshold: 1,
				judgeModelOptions: { judgeModel: "judge", numSamples: 1 },
			});
			const result = await evaluator.evaluateInvocations(
				[invocation("a")],
				[invocation("b")],
			);
			expect(result.perInvocationResults[0].score).toBe(1);
			expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		});

		it("maps score below threshold to INVALID via critiqueParser", async () => {
			const generateContent = vi.fn().mockResolvedValue({ text: "low" });
			LLMRegistry.registerModel("judge", { generateContent } as never);
			const evaluator = new StubJudgeEvaluator({
				metricName: "judge",
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "judge", numSamples: 1 },
			});
			const result = await evaluator.evaluateInvocations(
				[invocation("a")],
				[invocation("b")],
			);
			expect(result.perInvocationResults[0].score).toBe(0);
			expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
		});
	});

	describe("constructor guard", () => {
		it("throws when judgeModelOptions is missing from metric", () => {
			const metric: EvalMetric = {
				metricName: "judge",
				threshold: 0.5,
			};
			expect(() => new StubJudgeEvaluator(metric)).toThrow(
				"Judge model options is required for LlmAsJudge.",
			);
		});
	});
});
