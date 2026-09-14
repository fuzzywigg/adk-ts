import { describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { EvalStatus } from "../../evaluation/evaluator";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
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

describe("FinalResponseMatchV2Evaluator", () => {
	it("exposes metric info", () => {
		const info = FinalResponseMatchV2Evaluator.getMetricInfo();
		expect(info.metricName).toBe(PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2);
		expect(info.metricValueInfo?.interval?.minValue).toBe(0);
		expect(info.metricValueInfo?.interval?.maxValue).toBe(1);
	});

	it("returns NOT_EVALUATED when actual invocations are empty", async () => {
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
		expect(sampleJudge).not.toHaveBeenCalled();
	});

	it("scores all-valid labels as 1 and PASSED", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID, Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("actual answer")],
			[invocation("golden answer")],
		);

		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[0].score).toBe(1);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
	});

	it("scores mixed valid/invalid labels fractionally", async () => {
		const sampleJudge = vi
			.fn()
			.mockResolvedValue([
				Label.VALID,
				Label.INVALID,
				Label.VALID,
				Label.INVALID,
			]);
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
		expect(result.perInvocationResults[0].score).toBe(0.5);
	});

	it("passes numSamples from judgeModelOptions to sampleJudge", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const judgeModelOptions = {
			judgeModel: "fake-judge",
			numSamples: 3,
		};
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
				judgeModelOptions,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		await evaluator.evaluateInvocations(
			[invocation("actual")],
			[invocation("golden")],
		);

		expect(sampleJudge).toHaveBeenCalledTimes(1);
		expect(sampleJudge.mock.calls[0][1]).toBe(3);
		expect(sampleJudge.mock.calls[0][3]).toBe(judgeModelOptions);
	});

	it("marks status FAILED when score is below threshold", async () => {
		const sampleJudge = vi
			.fn()
			.mockResolvedValue([
				Label.VALID,
				Label.INVALID,
				Label.INVALID,
				Label.INVALID,
			]);
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

		expect(result.overallScore).toBe(0.25);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
	});

	it("marks status PASSED when score meets threshold", async () => {
		const sampleJudge = vi
			.fn()
			.mockResolvedValue([Label.VALID, Label.VALID, Label.INVALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.6,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("actual")],
			[invocation("golden")],
		);

		expect(result.overallScore).toBeCloseTo(2 / 3);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("defaults numSamples to 5 when judgeModelOptions omit it", async () => {
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

	it("substitutes prompt, response, and golden_response into the judge prompt", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		await evaluator.evaluateInvocations(
			[invocation("agent-says-this")],
			[
				{
					userContent: { parts: [{ text: "user-asks-this" }] },
					creationTimestamp: 1,
					finalResponse: {
						role: "model",
						parts: [{ text: "golden-says-this" }],
					},
				},
			],
		);

		const prompt = sampleJudge.mock.calls[0][0] as string;
		expect(prompt).toContain("user-asks-this");
		expect(prompt).toContain("agent-says-this");
		expect(prompt).toContain("golden-says-this");
		expect(prompt).toContain("is_the_agent_response_valid");
	});

	it("parseCritique maps valid/invalid variants and filters NOT_FOUND", async () => {
		const sampleJudge = vi.fn(
			async (
				_prompt: string,
				_numSamples: number,
				critiqueParser: (response: string) => Label,
			) => {
				expect(
					critiqueParser(
						'{"reasoning":"ok","is_the_agent_response_valid": "valid"}',
					),
				).toBe(Label.VALID);
				expect(
					critiqueParser(
						'{"is_the_agent_response_valid": ["Valid"], "reasoning": "x"}',
					),
				).toBe(Label.VALID);
				expect(
					critiqueParser('"is_the_agent_response_valid":\n  "INVALID"\n}'),
				).toBe(Label.INVALID);
				expect(
					critiqueParser(
						'{"is_the_agent_response_valid": ["invalid"], "reasoning": "no"}',
					),
				).toBe(Label.INVALID);
				expect(critiqueParser("not json at all")).toBe(Label.NOT_FOUND);
				expect(critiqueParser('{"reasoning": "x"}')).toBe(Label.NOT_FOUND);
				return [Label.VALID, Label.INVALID];
			},
		);

		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("a")],
			[invocation("b")],
		);
		expect(result.overallScore).toBe(0.5);
		expect(sampleJudge).toHaveBeenCalledTimes(1);
	});

	it("averages overall score across multiple invocations", async () => {
		const sampleJudge = vi
			.fn()
			.mockResolvedValueOnce([Label.VALID, Label.VALID])
			.mockResolvedValueOnce([Label.INVALID, Label.INVALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("a1"), invocation("a2")],
			[invocation("g1"), invocation("g2")],
		);

		expect(result.overallScore).toBe(0.5);
		expect(result.perInvocationResults).toHaveLength(2);
		expect(result.perInvocationResults[0].score).toBe(1);
		expect(result.perInvocationResults[1].score).toBe(0);
		expect(sampleJudge).toHaveBeenCalledTimes(2);
	});

	it("still judges when final responses are missing (empty strings)", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation(undefined)],
			[invocation(undefined)],
		);

		expect(sampleJudge).toHaveBeenCalledTimes(1);
		const prompt = sampleJudge.mock.calls[0][0] as string;
		expect(prompt).toContain('"Agent response":');
		expect(prompt).toContain('"Reference response":');
		expect(result.overallScore).toBe(1);
	});

	it("counts NOT_FOUND labels as non-valid when computing score", async () => {
		const sampleJudge = vi
			.fn()
			.mockResolvedValue([
				Label.VALID,
				Label.NOT_FOUND,
				Label.INVALID,
				Label.NOT_FOUND,
			]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.25,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("a")],
			[invocation("b")],
		);
		expect(result.overallScore).toBe(0.25);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("fails overall when all labels are NOT_FOUND (score 0)", async () => {
		const sampleJudge = vi
			.fn()
			.mockResolvedValue([Label.NOT_FOUND, Label.NOT_FOUND]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.1,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("a")],
			[invocation("b")],
		);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("parseCritique accepts bracketed and spaced valid variants", async () => {
		const sampleJudge = vi.fn(
			async (
				_prompt: string,
				_numSamples: number,
				critiqueParser: (response: string) => Label,
			) => {
				expect(
					critiqueParser(
						'{"is_the_agent_response_valid": [\n  "valid"\n], "reasoning": "x"}',
					),
				).toBe(Label.VALID);
				expect(
					critiqueParser(
						'"is_the_agent_response_valid":   "Valid"  , "reasoning": "y"',
					),
				).toBe(Label.VALID);
				expect(
					critiqueParser(
						'{"is_the_agent_response_valid": "VALID", "reasoning": "z"}',
					),
				).toBe(Label.VALID);
				expect(
					critiqueParser(
						'{"is_the_agent_response_valid": ["maybe"], "reasoning": "no"}',
					),
				).toBe(Label.INVALID);
				expect(
					critiqueParser(
						'{"is_the_agent_response_valid": [], "reasoning": "empty"}',
					),
				).toBe(Label.NOT_FOUND);
				expect(critiqueParser("")).toBe(Label.NOT_FOUND);
				return [Label.VALID];
			},
		);

		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("a")],
			[invocation("b")],
		);
		expect(result.overallScore).toBe(1);
	});

	it("joins multi-part user and response text with newlines in the judge prompt", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		await evaluator.evaluateInvocations(
			[
				{
					userContent: { parts: [{ text: "u1" }, { text: "u2" }] },
					creationTimestamp: 1,
					finalResponse: {
						role: "model",
						parts: [{ text: "a1" }, { text: "a2" }],
					},
				},
			],
			[
				{
					userContent: {
						parts: [{ text: "prompt-a" }, { text: "prompt-b" }],
					},
					creationTimestamp: 1,
					finalResponse: {
						role: "model",
						parts: [{ text: "g1" }, { text: "g2" }],
					},
				},
			],
		);

		const prompt = sampleJudge.mock.calls[0][0] as string;
		expect(prompt).toContain("prompt-a\nprompt-b");
		expect(prompt).toContain("a1\na2");
		expect(prompt).toContain("g1\ng2");
	});

	it("passes undefined judgeModelOptions through to sampleJudge", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
				judgeModelOptions: undefined,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		await evaluator.evaluateInvocations([invocation("a")], [invocation("b")]);

		expect(sampleJudge.mock.calls[0][1]).toBe(5);
		expect(sampleJudge.mock.calls[0][3]).toBeUndefined();
	});

	it("keeps per-invocation statuses when overall averages across the threshold", async () => {
		const sampleJudge = vi
			.fn()
			.mockResolvedValueOnce([
				Label.VALID,
				Label.VALID,
				Label.VALID,
				Label.VALID,
			])
			.mockResolvedValueOnce([
				Label.INVALID,
				Label.INVALID,
				Label.INVALID,
				Label.INVALID,
			]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("good"), invocation("bad")],
			[invocation("g1"), invocation("g2")],
		);

		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[1].evalStatus).toBe(EvalStatus.FAILED);
		expect(result.overallScore).toBe(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[0].actualInvocation).toEqual(
			invocation("good"),
		);
	});

	it("metric info description mentions LLM judge and [0,1] range", () => {
		const info = FinalResponseMatchV2Evaluator.getMetricInfo();
		expect(info.description).toMatch(/LLM judge/i);
		expect(info.description).toMatch(/\[0,1\]/);
		expect(info.metricValueInfo.interval?.openAtMin).toBe(false);
		expect(info.metricValueInfo.interval?.openAtMax).toBe(false);
	});

	it("uses numSamples=1 when judgeModelOptions sets it", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.INVALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0,
				judgeModelOptions: { judgeModel: "m", numSamples: 1 },
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("a")],
			[invocation("b")],
		);
		expect(sampleJudge.mock.calls[0][1]).toBe(1);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("propagates sampleJudge rejections to the caller", async () => {
		const sampleJudge = vi.fn().mockRejectedValue(new Error("judge down"));
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		await expect(
			evaluator.evaluateInvocations([invocation("a")], [invocation("b")]),
		).rejects.toThrow(/judge down/);
	});
});
