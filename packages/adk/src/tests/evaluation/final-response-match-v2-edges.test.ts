import { describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { FinalResponseMatchV2Evaluator } from "../../evaluation/final-response-match-v2";
import type { LlmAsJudge } from "../../evaluation/llm-as-judge";
import { Label } from "../../evaluation/llm-as-judge-utils";

function invocation(text?: string): Invocation {
	return {
		userContent: { parts: [{ text: "user prompt" }] },
		creationTimestamp: 1,
		finalResponse:
			text !== undefined ? { role: "model", parts: [{ text }] } : undefined,
	};
}

describe("FinalResponseMatchV2Evaluator leftover edges", () => {
	describe("numSamples ?? DEFAULT_NUM_SAMPLES", () => {
		it("defaults to 5 when judgeModelOptions is undefined", async () => {
			const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
			const evaluator = new FinalResponseMatchV2Evaluator(
				{
					metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
					threshold: 0.5,
				},
				{ sampleJudge } as unknown as LlmAsJudge,
			);
			await evaluator.evaluateInvocations(
				[invocation("actual")],
				[invocation("golden")],
			);
			expect(sampleJudge.mock.calls[0][1]).toBe(5);
		});

		it("defaults to 5 when numSamples is undefined inside judgeModelOptions", async () => {
			const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
			const evaluator = new FinalResponseMatchV2Evaluator(
				{
					metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
					threshold: 0.5,
					judgeModelOptions: { judgeModel: "fake" },
				},
				{ sampleJudge } as unknown as LlmAsJudge,
			);
			await evaluator.evaluateInvocations(
				[invocation("actual")],
				[invocation("golden")],
			);
			expect(sampleJudge.mock.calls[0][1]).toBe(5);
		});

		it("uses numSamples 0 without coalescing to default (?? only nullish)", async () => {
			const sampleJudge = vi.fn().mockResolvedValue([]);
			const evaluator = new FinalResponseMatchV2Evaluator(
				{
					metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
					threshold: 0.5,
					judgeModelOptions: { judgeModel: "fake", numSamples: 0 },
				},
				{ sampleJudge } as unknown as LlmAsJudge,
			);
			await evaluator.evaluateInvocations(
				[invocation("actual")],
				[invocation("golden")],
			);
			expect(sampleJudge.mock.calls[0][1]).toBe(0);
		});

		it("uses explicit numSamples when provided", async () => {
			const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
			const evaluator = new FinalResponseMatchV2Evaluator(
				{
					metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
					threshold: 0.5,
					judgeModelOptions: { judgeModel: "fake", numSamples: 3 },
				},
				{ sampleJudge } as unknown as LlmAsJudge,
			);
			await evaluator.evaluateInvocations(
				[invocation("actual")],
				[invocation("golden")],
			);
			expect(sampleJudge.mock.calls[0][1]).toBe(3);
		});
	});

	describe("empty actualInvocations", () => {
		it("returns NOT_EVALUATED without calling sampleJudge", async () => {
			const sampleJudge = vi.fn();
			const evaluator = new FinalResponseMatchV2Evaluator(
				{
					metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
					threshold: 0.5,
				},
				{ sampleJudge } as unknown as LlmAsJudge,
			);
			const result = await evaluator.evaluateInvocations([], []);
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
			expect(result.perInvocationResults).toEqual([]);
			expect(result.overallScore).toBeUndefined();
			expect(sampleJudge).not.toHaveBeenCalled();
		});
	});

	describe("parseCritique regex miss paths via sampleJudge", () => {
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

		it("returns NOT_FOUND for empty response string", async () => {
			expect(await parseLabel("")).toBe(Label.NOT_FOUND);
		});

		it("returns NOT_FOUND when validity key is absent", async () => {
			expect(await parseLabel('{"reasoning": "no key"}')).toBe(Label.NOT_FOUND);
		});

		it("returns NOT_FOUND when captured value is empty string", async () => {
			expect(await parseLabel('{"is_the_agent_response_valid": ""}')).toBe(
				Label.NOT_FOUND,
			);
		});

		it("returns INVALID for unrecognized captured tokens", async () => {
			expect(await parseLabel('{"is_the_agent_response_valid": "maybe"}')).toBe(
				Label.INVALID,
			);
		});

		it("returns INVALID for partial keyword match", async () => {
			expect(
				await parseLabel('{"is_the_agent_response_valid": "validated"}'),
			).toBe(Label.INVALID);
		});

		it("returns VALID for case-insensitive valid token", async () => {
			expect(await parseLabel('{"is_the_agent_response_valid": "VALID"}')).toBe(
				Label.VALID,
			);
		});

		it("returns INVALID for case-insensitive invalid token", async () => {
			expect(
				await parseLabel('{"is_the_agent_response_valid": "Invalid"}'),
			).toBe(Label.INVALID);
		});

		it("returns NOT_FOUND for malformed JSON without regex match", async () => {
			expect(await parseLabel("not json at all")).toBe(Label.NOT_FOUND);
		});

		it("returns VALID for bracketed array form with valid", async () => {
			expect(
				await parseLabel(
					'{"is_the_agent_response_valid": ["valid"], "reasoning": []}',
				),
			).toBe(Label.VALID);
		});

		it("returns VALID for unquoted valid token before brace", async () => {
			expect(await parseLabel('{"is_the_agent_response_valid": valid}')).toBe(
				Label.VALID,
			);
		});
	});

	describe("scoring with empty label lists from regex misses", () => {
		it("produces NaN overallScore when all labels are NOT_FOUND", async () => {
			const sampleJudge = vi
				.fn()
				.mockResolvedValue([Label.NOT_FOUND, Label.NOT_FOUND]);
			const evaluator = new FinalResponseMatchV2Evaluator(
				{
					metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
					threshold: 0.5,
				},
				{ sampleJudge } as unknown as LlmAsJudge,
			);
			const result = await evaluator.evaluateInvocations(
				[invocation("actual")],
				[invocation("golden")],
			);
			expect(result.overallScore).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("yields NaN when sampleJudge returns empty array (numSamples 0)", async () => {
			const sampleJudge = vi.fn().mockResolvedValue([]);
			const evaluator = new FinalResponseMatchV2Evaluator(
				{
					metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
					threshold: 0.5,
					judgeModelOptions: { judgeModel: "fake", numSamples: 0 },
				},
				{ sampleJudge } as unknown as LlmAsJudge,
			);
			const result = await evaluator.evaluateInvocations(
				[invocation("actual")],
				[invocation("golden")],
			);
			expect(Number.isNaN(result.overallScore)).toBe(true);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});
	});

	describe("threshold boundaries", () => {
		it("passes when score equals threshold exactly", async () => {
			const sampleJudge = vi
				.fn()
				.mockResolvedValue([Label.VALID, Label.INVALID]);
			const evaluator = new FinalResponseMatchV2Evaluator(
				{
					metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
					threshold: 0.5,
				},
				{ sampleJudge } as unknown as LlmAsJudge,
			);
			const result = await evaluator.evaluateInvocations(
				[invocation("actual")],
				[invocation("golden")],
			);
			expect(result.overallScore).toBe(0.5);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});

		it("fails when score is below threshold", async () => {
			const sampleJudge = vi
				.fn()
				.mockResolvedValue([Label.VALID, Label.INVALID, Label.INVALID]);
			const evaluator = new FinalResponseMatchV2Evaluator(
				{
					metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
					threshold: 0.5,
				},
				{ sampleJudge } as unknown as LlmAsJudge,
			);
			const result = await evaluator.evaluateInvocations(
				[invocation("actual")],
				[invocation("golden")],
			);
			expect(result.overallScore).toBeCloseTo(1 / 3);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});
	});
});
