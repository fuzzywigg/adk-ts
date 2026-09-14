import type { Part } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { RougeEvaluator } from "../../evaluation/final-response-match-v1";
import { FinalResponseMatchV2Evaluator } from "../../evaluation/final-response-match-v2";
import type { LlmAsJudge } from "../../evaluation/llm-as-judge";
import { Label } from "../../evaluation/llm-as-judge-utils";

function invocation(text?: string): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse:
			text !== undefined ? { role: "model", parts: [{ text }] } : undefined,
	};
}

function multiPart(parts: Part[]): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse: { role: "model", parts },
	};
}

describe("final-response-match leftover matrix edges", () => {
	describe("RougeEvaluator v1 — empty/whitespace trim short-circuit matrix", () => {
		const evaluator = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});

		it.each([
			{ actual: "", expected: "hello", label: "empty actual" },
			{ actual: "hello", expected: "", label: "empty expected" },
			{ actual: "   ", expected: "hello", label: "spaces actual" },
			{ actual: "hello", expected: "\t\t", label: "tabs expected" },
			{ actual: "\n\n", expected: "hello", label: "newlines actual" },
			{ actual: "  \t\n  ", expected: "  \n  ", label: "both whitespace" },
			{ actual: "!!!", expected: "hello", label: "punct-only actual" },
			{ actual: "hello", expected: "???", label: "punct-only expected" },
		])("scores 0 for $label", async ({ actual, expected }) => {
			const result = await evaluator.evaluateInvocations(
				[invocation(actual)],
				[invocation(expected)],
			);
			expect(result.perInvocationResults[0].score).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it.each([
			{ response: "alpha beta", reference: "alpha beta", score: 1 },
			{
				response: "alpha beta",
				reference: "alpha",
				score: expect.closeTo(2 / 3),
			},
			{
				response: "alpha",
				reference: "alpha beta",
				score: expect.closeTo(2 / 3),
			},
			{ response: "zzz", reference: "yyy", score: 0 },
		])("token overlap $response vs $reference", async ({
			response,
			reference,
			score,
		}) => {
			const result = await evaluator.evaluateInvocations(
				[invocation(response)],
				[invocation(reference)],
			);
			if (typeof score === "number") {
				expect(result.overallScore).toBe(score);
			} else {
				expect(result.overallScore).toEqual(score);
			}
		});

		it.each([
			0, 0.25, 0.5, 0.75, 1,
		])("threshold boundary at %s with identical text", async (threshold) => {
			const e = new RougeEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
				threshold,
			});
			const result = await e.evaluateInvocations(
				[invocation("same words")],
				[invocation("same words")],
			);
			expect(result.overallScore).toBe(1);
			expect(result.overallEvalStatus).toBe(
				1 >= threshold ? EvalStatus.PASSED : EvalStatus.FAILED,
			);
		});

		it("trim short-circuit still applies after multi-part join of whitespace parts", async () => {
			const result = await evaluator.evaluateInvocations(
				[multiPart([{ text: "  " }, { text: "\t" }])],
				[invocation("meaningful")],
			);
			expect(result.overallScore).toBe(0);
		});

		it("empty invocations stay NOT_EVALUATED across thresholds", async () => {
			for (const threshold of [0, 0.5, 1]) {
				const e = new RougeEvaluator({
					metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
					threshold,
				});
				const result = await e.evaluateInvocations([], []);
				expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
				expect(result.perInvocationResults).toEqual([]);
			}
		});
	});

	describe("FinalResponseMatchV2 — numSamples ?? vs || leftover matrix", () => {
		it.each([
			{ numSamples: undefined, expected: 5, label: "undefined → DEFAULT 5" },
			{ numSamples: null as unknown as number, expected: 5, label: "null → 5" },
			{ numSamples: 0, expected: 0, label: "0 kept via ??" },
			{ numSamples: 1, expected: 1, label: "explicit 1" },
			{ numSamples: 3, expected: 3, label: "explicit 3" },
			{ numSamples: 7, expected: 7, label: "explicit 7" },
		])("$label", async ({ numSamples, expected }) => {
			const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
			const metric: any = {
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
			};
			if (numSamples !== undefined) {
				metric.judgeModelOptions = {
					judgeModel: "fake",
					numSamples,
				};
			}
			const evaluator = new FinalResponseMatchV2Evaluator(metric, {
				sampleJudge,
			} as unknown as LlmAsJudge);
			await evaluator.evaluateInvocations(
				[invocation("actual")],
				[invocation("golden")],
			);
			expect(sampleJudge.mock.calls[0][1]).toBe(expected);
		});

		it("omitted judgeModelOptions entirely still defaults numSamples to 5", async () => {
			const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
			const evaluator = new FinalResponseMatchV2Evaluator(
				{
					metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
					threshold: 0.5,
				},
				{ sampleJudge } as unknown as LlmAsJudge,
			);
			await evaluator.evaluateInvocations([invocation("a")], [invocation("g")]);
			expect(sampleJudge.mock.calls[0][1]).toBe(5);
		});
	});

	describe("FinalResponseMatchV2 — critique parse token matrix", () => {
		async function parseLabel(raw: string): Promise<Label> {
			let captured: Label | undefined;
			const sampleJudge = vi
				.fn()
				.mockImplementation(
					async (
						_prompt: string,
						_n: number,
						critiqueParser: (response: string) => Label,
					) => {
						captured = critiqueParser(raw);
						return captured === Label.NOT_FOUND ? [] : [captured];
					},
				);
			const evaluator = new FinalResponseMatchV2Evaluator(
				{
					metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
					threshold: 0.5,
					judgeModelOptions: { judgeModel: "fake", numSamples: 1 },
				},
				{ sampleJudge } as unknown as LlmAsJudge,
			);
			await evaluator.evaluateInvocations(
				[invocation("actual")],
				[invocation("golden")],
			);
			return captured as Label;
		}

		it.each([
			{ raw: "", label: Label.NOT_FOUND },
			{ raw: "not json", label: Label.NOT_FOUND },
			{ raw: '{"reasoning":"x"}', label: Label.NOT_FOUND },
			{ raw: '{"is_the_agent_response_valid": ""}', label: Label.NOT_FOUND },
			{ raw: '{"is_the_agent_response_valid": "valid"}', label: Label.VALID },
			{ raw: '{"is_the_agent_response_valid": "VALID"}', label: Label.VALID },
			{ raw: '{"is_the_agent_response_valid": "Valid"}', label: Label.VALID },
			{
				raw: '{"is_the_agent_response_valid": "invalid"}',
				label: Label.INVALID,
			},
			{
				raw: '{"is_the_agent_response_valid": "Invalid"}',
				label: Label.INVALID,
			},
			{ raw: '{"is_the_agent_response_valid": "maybe"}', label: Label.INVALID },
			{
				raw: '{"is_the_agent_response_valid": "validated"}',
				label: Label.INVALID,
			},
			{ raw: '{"is_the_agent_response_valid": valid}', label: Label.VALID },
			{
				raw: '{"is_the_agent_response_valid": ["valid"]}',
				label: Label.VALID,
			},
			{
				raw: '{"is_the_agent_response_valid": ["invalid"]}',
				label: Label.INVALID,
			},
			{
				raw: '{\n  "is_the_agent_response_valid": "valid"\n}',
				label: Label.VALID,
			},
		])("parse($raw) → $label", async ({ raw, label }) => {
			expect(await parseLabel(raw)).toBe(label);
		});
	});

	describe("FinalResponseMatchV2 — threshold × label mix matrix", () => {
		it.each([
			{
				labels: [Label.VALID, Label.VALID],
				threshold: 0.5,
				score: 1,
				status: EvalStatus.PASSED,
			},
			{
				labels: [Label.VALID, Label.INVALID],
				threshold: 0.5,
				score: 0.5,
				status: EvalStatus.PASSED,
			},
			{
				labels: [Label.VALID, Label.INVALID],
				threshold: 0.51,
				score: 0.5,
				status: EvalStatus.FAILED,
			},
			{
				labels: [Label.INVALID, Label.INVALID],
				threshold: 0,
				score: 0,
				status: EvalStatus.PASSED,
			},
			{
				labels: [Label.VALID, Label.INVALID, Label.INVALID],
				threshold: 0.34,
				score: 1 / 3,
				status: EvalStatus.FAILED,
			},
			{
				labels: [Label.VALID, Label.INVALID, Label.INVALID],
				threshold: 1 / 3,
				score: 1 / 3,
				status: EvalStatus.PASSED,
			},
		])("score=$score vs threshold=$threshold → $status", async ({
			labels,
			threshold,
			score,
			status,
		}) => {
			const sampleJudge = vi.fn().mockResolvedValue(labels);
			const evaluator = new FinalResponseMatchV2Evaluator(
				{
					metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
					threshold,
					judgeModelOptions: { judgeModel: "fake", numSamples: labels.length },
				},
				{ sampleJudge } as unknown as LlmAsJudge,
			);
			const result = await evaluator.evaluateInvocations(
				[invocation("a")],
				[invocation("g")],
			);
			expect(result.overallScore).toBeCloseTo(score);
			expect(result.overallEvalStatus).toBe(status);
		});

		it("empty actualInvocations short-circuits without sampleJudge", async () => {
			const sampleJudge = vi.fn();
			const evaluator = new FinalResponseMatchV2Evaluator(
				{
					metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
					threshold: 0.9,
				},
				{ sampleJudge } as unknown as LlmAsJudge,
			);
			const result = await evaluator.evaluateInvocations([], []);
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
			expect(sampleJudge).not.toHaveBeenCalled();
		});
	});

	describe("getMetricInfo stability for both evaluators", () => {
		it("RougeEvaluator metric info is stable", () => {
			expect(RougeEvaluator.getMetricInfo()).toEqual(
				RougeEvaluator.getMetricInfo(),
			);
			expect(RougeEvaluator.getMetricInfo().metricName).toBe(
				PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			);
		});

		it("FinalResponseMatchV2Evaluator metric info is stable", () => {
			expect(FinalResponseMatchV2Evaluator.getMetricInfo()).toEqual(
				FinalResponseMatchV2Evaluator.getMetricInfo(),
			);
			expect(FinalResponseMatchV2Evaluator.getMetricInfo().metricName).toBe(
				PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
			);
		});
	});
});
