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

	it("defaults numSamples to 5 when judgeModelOptions is omitted entirely", async () => {
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

	it("defaults numSamples to 5 when judgeModelOptions omit numSamples", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const judgeModelOptions = { judgeModel: "fake-judge" };
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

		expect(sampleJudge.mock.calls[0][1]).toBe(5);
		expect(sampleJudge.mock.calls[0][3]).toBe(judgeModelOptions);
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

	it("exposes metric info description and closed interval flags", () => {
		const info = FinalResponseMatchV2Evaluator.getMetricInfo();
		expect(info.description).toContain("LLM judge");
		expect(info.description).toContain("[0,1]");
		expect(info.metricValueInfo?.interval?.openAtMin).toBe(false);
		expect(info.metricValueInfo?.interval?.openAtMax).toBe(false);
	});

	it("substitutes empty user/response/golden text and clears placeholders", async () => {
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
			userContent: { parts: [{ text: "ignored-actual-user" }] },
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
		expect(prompt).not.toContain("ignored-actual-user");
	});

	it("uses expected.userContent for the prompt, not actual.userContent", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "fake", numSamples: 1 },
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		await evaluator.evaluateInvocations(
			[
				{
					userContent: { parts: [{ text: "actual-user-should-not-appear" }] },
					creationTimestamp: 1,
					finalResponse: { role: "model", parts: [{ text: "agent-out" }] },
				},
			],
			[
				{
					userContent: { parts: [{ text: "expected-user-prompt" }] },
					creationTimestamp: 1,
					finalResponse: { role: "model", parts: [{ text: "golden-out" }] },
				},
			],
		);

		const prompt = sampleJudge.mock.calls[0][0] as string;
		expect(prompt).toContain("expected-user-prompt");
		expect(prompt).toContain("agent-out");
		expect(prompt).toContain("golden-out");
		expect(prompt).not.toContain("actual-user-should-not-appear");
	});

	it("joins multi-part content with newlines inside the judge prompt", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "fake", numSamples: 1 },
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		await evaluator.evaluateInvocations(
			[
				{
					userContent: { parts: [{ text: "u" }] },
					creationTimestamp: 1,
					finalResponse: {
						role: "model",
						parts: [{ text: "agent-a" }, { text: "agent-b" }],
					},
				},
			],
			[
				{
					userContent: {
						parts: [{ text: "prompt-a" }, { text: "" }, { text: "prompt-b" }],
					},
					creationTimestamp: 1,
					finalResponse: {
						role: "model",
						parts: [{ text: "gold-a" }, { text: "gold-b" }],
					},
				},
			],
		);

		const prompt = sampleJudge.mock.calls[0][0] as string;
		expect(prompt).toContain("prompt-a\nprompt-b");
		expect(prompt).toContain("agent-a\nagent-b");
		expect(prompt).toContain("gold-a\ngold-b");
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
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
	});

	it("scores all-INVALID labels as zero and FAILED", async () => {
		const sampleJudge = vi
			.fn()
			.mockResolvedValue([Label.INVALID, Label.INVALID, Label.INVALID]);
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

	it("scores all-NOT_FOUND labels as zero and FAILED", async () => {
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

	it("passes when fractional score equals the threshold exactly", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID, Label.INVALID]);
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
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
	});

	it("marks overall FAILED when multi-invocation average is below threshold", async () => {
		const sampleJudge = vi
			.fn()
			.mockResolvedValueOnce([Label.VALID, Label.VALID])
			.mockResolvedValueOnce([Label.INVALID, Label.INVALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.75,
				judgeModelOptions: { judgeModel: "fake", numSamples: 2 },
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);

		const result = await evaluator.evaluateInvocations(
			[invocation("a1"), invocation("a2")],
			[invocation("g1"), invocation("g2")],
		);

		expect(result.overallScore).toBe(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[1].evalStatus).toBe(EvalStatus.FAILED);
	});

	it("preserves actual and expected invocation references on results", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
		const evaluator = new FinalResponseMatchV2Evaluator(
			{
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.5,
				judgeModelOptions: { judgeModel: "fake", numSamples: 1 },
			},
			{ sampleJudge } as unknown as LlmAsJudge,
		);
		const actual = invocation("actual");
		const expected = invocation("golden");

		const result = await evaluator.evaluateInvocations([actual], [expected]);

		expect(result.perInvocationResults[0].actualInvocation).toBe(actual);
		expect(result.perInvocationResults[0].expectedInvocation).toBe(expected);
	});

	it("passes critiqueParser as the third sampleJudge argument", async () => {
		const sampleJudge = vi.fn().mockResolvedValue([Label.VALID]);
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

		expect(typeof sampleJudge.mock.calls[0][2]).toBe("function");
	});

	it("yields NaN overallScore when sampleJudge returns an empty label list", async () => {
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
			return parsed as Label;
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

		it("is case-insensitive for INVALID", async () => {
			await expect(
				parseViaJudge('{"is_the_agent_response_valid": "Invalid"}'),
			).resolves.toBe(Label.INVALID);
		});

		it("maps bracketed unquoted valid before a comma", async () => {
			await expect(
				parseViaJudge(
					'{"is_the_agent_response_valid": [valid], "reasoning": []}',
				),
			).resolves.toBe(Label.VALID);
		});

		it("returns NOT_FOUND for an empty string response", async () => {
			await expect(parseViaJudge("")).resolves.toBe(Label.NOT_FOUND);
		});

		it("returns NOT_FOUND when the captured value is empty", async () => {
			await expect(
				parseViaJudge('{"is_the_agent_response_valid": ""}'),
			).resolves.toBe(Label.NOT_FOUND);
		});

		it("maps validity key when followed by a trailing comma", async () => {
			await expect(
				parseViaJudge(
					'{"is_the_agent_response_valid": "valid",\n"reasoning": ["x"]}',
				),
			).resolves.toBe(Label.VALID);
		});
	});
});
