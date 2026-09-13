import { describe, expect, it, vi } from "vitest";
import type { EvalCase } from "../../evaluation/eval-case";
import type { EvalSet } from "../../evaluation/eval-set";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { LocalEvalService } from "../../evaluation/local-eval-service";

function makeEvalSet(evalCase: EvalCase): EvalSet {
	return {
		evalSetId: "set-1",
		evalCases: [evalCase],
		creationTimestamp: 1,
	};
}

describe("LocalEvalService", () => {
	it("performInference yields expected and actual invocations from stub ask", async () => {
		const ask = vi.fn(async () => "hello world");
		const service = new LocalEvalService({
			name: "stub-agent",
			ask,
		} as any);

		const evalCase: EvalCase = {
			evalId: "caseA",
			conversation: [
				{
					invocationId: "ignored",
					userContent: { role: "user", parts: [{ text: "hi" }] },
					finalResponse: {
						role: "model",
						parts: [{ text: "hello world" }],
					},
					creationTimestamp: 1,
				},
			],
		};

		const batches: {
			invocationId: string;
			finalResponse?: { parts?: { text?: string }[] };
		}[][] = [];
		for await (const batch of service.performInference({
			evalSetId: "set-1",
			evalCases: [makeEvalSet(evalCase)],
		})) {
			batches.push(batch);
		}

		expect(ask).toHaveBeenCalledWith(evalCase.conversation[0].userContent);
		expect(batches).toHaveLength(1);
		expect(batches[0]).toHaveLength(2);
		const [expected, actual] = batches[0];
		expect(expected.invocationId).toContain("expected");
		expect(expected.finalResponse?.parts?.[0]?.text).toBe("hello world");
		expect(actual.invocationId).toBe("caseA-0");
		expect(actual.finalResponse?.parts?.[0]?.text).toBe("hello world");
	});

	it("embeds error message when ask throws", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const service = new LocalEvalService({
			name: "failing-agent",
			ask: async () => {
				throw new Error("boom failure");
			},
		} as any);

		const evalCase: EvalCase = {
			evalId: "errCase",
			conversation: [
				{
					invocationId: "x",
					userContent: { role: "user", parts: [{ text: "hi" }] },
					creationTimestamp: 1,
				},
			],
		};

		let actualText = "";
		for await (const batch of service.performInference({
			evalSetId: "set-1",
			evalCases: [makeEvalSet(evalCase)],
		})) {
			actualText = batch[0].finalResponse?.parts?.[0]?.text ?? "";
		}

		expect(actualText).toContain("Error: boom failure");
		errorSpy.mockRestore();
	});

	it("evaluate scores RESPONSE_MATCH_SCORE offline", async () => {
		const service = new LocalEvalService({
			name: "unused",
			ask: async () => "unused",
		} as any);

		const sharedText = "The quick brown fox jumps";
		const results: unknown[] = [];
		for await (const evalResult of service.evaluate({
			inferenceResults: [
				[
					{
						invocationId: "matchCase-expected",
						userContent: { role: "user", parts: [{ text: "q" }] },
						finalResponse: {
							role: "model",
							parts: [{ text: sharedText }],
						},
						creationTimestamp: 1,
					},
					{
						invocationId: "matchCase-actual",
						userContent: { role: "user", parts: [{ text: "q" }] },
						finalResponse: {
							role: "model",
							parts: [{ text: sharedText }],
						},
						creationTimestamp: 2,
					},
				],
			],
			evaluateConfig: {
				evalMetrics: [
					{
						metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
						threshold: 0.5,
					},
				],
			},
		})) {
			results.push(evalResult);
		}

		expect(results).toHaveLength(1);
		const evalResult = results[0] as {
			evalCaseResults: {
				finalEvalStatus: EvalStatus;
				evalMetricResultPerInvocation: {
					evalMetricResults: { score?: number; evalStatus: EvalStatus }[];
				}[];
			}[];
		};
		expect(evalResult.evalCaseResults[0].finalEvalStatus).toBe(
			EvalStatus.PASSED,
		);
		expect(
			evalResult.evalCaseResults[0].evalMetricResultPerInvocation[0]
				.evalMetricResults[0].score,
		).toBe(1);
	});
});
