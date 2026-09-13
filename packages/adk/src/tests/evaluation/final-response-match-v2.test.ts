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

	it("defaults numSamples to 5 when judgeModelOptions is omitted", async () => {
		const sampleJudge = vi
			.fn()
			.mockResolvedValue([
				Label.VALID,
				Label.VALID,
				Label.VALID,
				Label.VALID,
				Label.VALID,
			]);
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

		expect(sampleJudge).toHaveBeenCalledTimes(1);
		expect(sampleJudge.mock.calls[0][1]).toBe(5);
		expect(sampleJudge.mock.calls[0][3]).toBeUndefined();
	});

	it("substitutes empty user/response/golden text into the judge prompt", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "fake", numSamples: 1 },
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const emptyExpected: Invocation = {
			userContent: { parts: [] },
			creationTimestamp: 1,
			finalResponse: { role: "model", parts: [] },
		};
		const emptyActual: Invocation = {
			userContent: { parts: [{ text: "ignored" }] },
			creationTimestamp: 1,
			finalResponse: undefined,
		};

		await evaluator.evaluateInvocations([emptyActual], [emptyExpected]);

		const prompt = sampleJudge.mock.calls[0][0] as string;
		expect(prompt).toContain('"User prompt": ');
		expect(prompt).toContain('"Agent response": ');
		expect(prompt).toContain('"Reference response": ');
		expect(prompt).not.toContain("{prompt}");
		expect(prompt).not.toContain("{response}");
		expect(prompt).not.toContain("{golden_response}");
	});

	it("averages scores across multiple invocations", async () => {
		const sampleJudge = vi
			.fn()
			.mockResolvedValueOnce([Label.VALID, Label.VALID])
			.mockResolvedValueOnce([Label.INVALID, Label.INVALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "fake", numSamples: 2 },
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("a1"), invocation("a2")],
			[invocation("g1"), invocation("g2")],
		);

		expect(sampleJudge).toHaveBeenCalledTimes(2);
		expect(result.perInvocationResults).toHaveLength(2);
		expect(result.perInvocationResults[0].score).toBe(1);
		expect(result.perInvocationResults[1].score).toBe(0);
		expect(result.overallScore).toBe(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("treats NOT_FOUND labels as non-valid when scoring", async () => {
		const sampleJudge = vi
			.fn()
			.mockResolvedValue([Label.VALID, Label.NOT_FOUND, Label.INVALID]);
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

	describe("parseCritique via sampleJudge critiqueParser", () => {
		async function parseViaJudge(raw: string): Promise<Label> {
			let parsed: Label | undefined;
			const sampleJudge = vi
				.fn()
				.mockImplementation(
					async (
						_prompt: string,
						_n: number,
						critiqueParser: (response: string) => Label,
					) => {
						parsed = critiqueParser(raw);
						return [parsed];
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
			expect(parsed).toBeDefined();
			return parsed!;
		}

		it("maps quoted valid to Label.VALID", async () => {
			await expect(
				parseViaJudge(
					'{"reasoning": ["ok"], "is_the_agent_response_valid": "valid"}',
				),
			).resolves.toBe(Label.VALID);
		});

		it("maps quoted invalid to Label.INVALID", async () => {
			await expect(
				parseViaJudge(
					'{"reasoning": ["no"], "is_the_agent_response_valid": "invalid"}',
				),
			).resolves.toBe(Label.INVALID);
		});

		it("maps bracketed valid with newlines", async () => {
			await expect(
				parseViaJudge(
					'{\n  "is_the_agent_response_valid": [\n    "valid"\n  ],\n  "reasoning": ["x"]\n}',
				),
			).resolves.toBe(Label.VALID);
		});

		it("maps unquoted valid token before closing brace", async () => {
			await expect(
				parseViaJudge('{"is_the_agent_response_valid": valid}'),
			).resolves.toBe(Label.VALID);
		});

		it("maps unrecognized captured tokens to Label.INVALID", async () => {
			await expect(
				parseViaJudge('{"is_the_agent_response_valid": "maybe"}'),
			).resolves.toBe(Label.INVALID);
		});

		it("returns NOT_FOUND when the validity key is missing", async () => {
			await expect(
				parseViaJudge('{"reasoning": ["no label key here"]}'),
			).resolves.toBe(Label.NOT_FOUND);
		});

		it("is case-insensitive for VALID", async () => {
			await expect(
				parseViaJudge('{"is_the_agent_response_valid": "VALID"}'),
			).resolves.toBe(Label.VALID);
		});
	});
});
