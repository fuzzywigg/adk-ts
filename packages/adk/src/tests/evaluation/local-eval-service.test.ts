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

	it("runs multi-turn inference and logs sessionInput when no initializer exists", async () => {
		const ask = vi.fn(async (msg: unknown) => {
			const text =
				typeof msg === "string"
					? msg
					: ((msg as { parts?: { text?: string }[] })?.parts?.[0]?.text ?? "");
			return `echo:${text}`;
		});
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const service = new LocalEvalService({
			name: "stub-agent",
			ask,
		} as any);

		const evalCase: EvalCase = {
			evalId: "multi",
			sessionInput: { state: { seeded: true } } as any,
			conversation: [
				{
					userContent: { role: "user", parts: [{ text: "one" }] },
					finalResponse: {
						role: "model",
						parts: [{ text: "echo:one" }],
					},
					creationTimestamp: 1,
				},
				{
					userContent: { role: "user", parts: [{ text: "two" }] },
					finalResponse: {
						role: "model",
						parts: [{ text: "echo:two" }],
					},
					creationTimestamp: 2,
				},
			],
		};

		const batches: unknown[][] = [];
		for await (const batch of service.performInference({
			evalSetId: "set-1",
			evalCases: [makeEvalSet(evalCase)],
		})) {
			batches.push(batch);
		}

		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("Session input provided for multi"),
			{ state: { seeded: true } },
		);
		expect(ask).toHaveBeenCalledTimes(2);
		expect(batches[0]).toHaveLength(4);
		log.mockRestore();
	});

	it("groups evaluate results using last hyphen in invocation ids", async () => {
		const service = new LocalEvalService({
			name: "unused",
			ask: async () => "unused",
		} as any);

		const results: { evalSetId: string }[] = [];
		for await (const evalResult of service.evaluate({
			inferenceResults: [
				[
					{
						invocationId: "case-with-dashes-expected",
						userContent: { role: "user", parts: [{ text: "q" }] },
						finalResponse: {
							role: "model",
							parts: [{ text: "same" }],
						},
						creationTimestamp: 1,
					},
					{
						invocationId: "case-with-dashes-actual",
						userContent: { role: "user", parts: [{ text: "q" }] },
						finalResponse: {
							role: "model",
							parts: [{ text: "same" }],
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
		expect(results[0].evalSetId).toBe("case-with-dashes");
	});
});
