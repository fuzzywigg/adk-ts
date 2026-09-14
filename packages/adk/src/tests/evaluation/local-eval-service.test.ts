import { describe, expect, it, vi } from "vitest";
import type { EvalCase } from "../../evaluation/eval-case";
import type { EvalSet } from "../../evaluation/eval-set";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { LocalEvalService } from "../../evaluation/local-eval-service";
import { DEFAULT_METRIC_EVALUATOR_REGISTRY } from "../../evaluation/metric-evaluator-registry";

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

	it("uses initializeSession when provided on the runner", async () => {
		const initializeSession = vi.fn(async () => undefined);
		const ask = vi.fn(async () => "ok");
		const service = new LocalEvalService({
			name: "stub-agent",
			ask,
			initializeSession,
		} as any);

		const evalCase: EvalCase = {
			evalId: "init-session",
			sessionInput: { state: { a: 1 } } as any,
			conversation: [
				{
					userContent: { role: "user", parts: [{ text: "hi" }] },
					creationTimestamp: 1,
				},
			],
		};

		for await (const _ of service.performInference({
			evalSetId: "set-1",
			evalCases: [makeEvalSet(evalCase)],
		})) {
			/* drain */
		}

		expect(initializeSession).toHaveBeenCalledWith({ state: { a: 1 } });
		expect(ask).toHaveBeenCalledTimes(1);
	});

	it("falls back to setSessionState when initializeSession is absent", async () => {
		const setSessionState = vi.fn(async () => undefined);
		const ask = vi.fn(async () => "ok");
		const service = new LocalEvalService({
			name: "stub-agent",
			ask,
			setSessionState,
		} as any);

		const evalCase: EvalCase = {
			evalId: "set-state",
			sessionInput: { state: { b: 2 } } as any,
			conversation: [
				{
					userContent: { role: "user", parts: [{ text: "hi" }] },
					creationTimestamp: 1,
				},
			],
		};

		for await (const _ of service.performInference({
			evalSetId: "set-1",
			evalCases: [makeEvalSet(evalCase)],
		})) {
			/* drain */
		}

		expect(setSessionState).toHaveBeenCalledWith({ state: { b: 2 } });
	});

	it("warns and continues when session initialization throws", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const ask = vi.fn(async () => "still-runs");
		const service = new LocalEvalService({
			name: "stub-agent",
			ask,
			initializeSession: async () => {
				throw new Error("session boom");
			},
		} as any);

		const evalCase: EvalCase = {
			evalId: "session-fail",
			sessionInput: { state: {} } as any,
			conversation: [
				{
					userContent: { role: "user", parts: [{ text: "hi" }] },
					creationTimestamp: 1,
				},
			],
		};

		const batches: { finalResponse?: { parts?: { text?: string }[] } }[][] = [];
		for await (const batch of service.performInference({
			evalSetId: "set-1",
			evalCases: [makeEvalSet(evalCase)],
		})) {
			batches.push(batch);
		}

		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("Failed to initialize session for session-fail"),
			expect.any(Error),
		);
		expect(batches[0][0].finalResponse?.parts?.[0]?.text).toBe("still-runs");
		warn.mockRestore();
	});

	it("skips inference batches whose first invocation lacks an id", async () => {
		const service = new LocalEvalService({
			name: "unused",
			ask: async () => "unused",
		} as any);

		const results: unknown[] = [];
		for await (const evalResult of service.evaluate({
			inferenceResults: [
				[
					{
						userContent: { role: "user", parts: [{ text: "q" }] },
						finalResponse: {
							role: "model",
							parts: [{ text: "x" }],
						},
						creationTimestamp: 1,
					} as any,
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

		expect(results).toEqual([]);
	});

	it("marks NOT_EVALUATED when metric returns empty perInvocationResults", async () => {
		const service = new LocalEvalService({
			name: "unused",
			ask: async () => "unused",
		} as any);

		const originalGet = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator.bind(
			DEFAULT_METRIC_EVALUATOR_REGISTRY,
		);
		const spy = vi
			.spyOn(DEFAULT_METRIC_EVALUATOR_REGISTRY, "getEvaluator")
			.mockImplementation((metric) => {
				if (metric.metricName === PrebuiltMetrics.RESPONSE_MATCH_SCORE) {
					return {
						evaluateInvocations: async () => ({
							overallScore: undefined,
							overallEvalStatus: EvalStatus.NOT_EVALUATED,
							perInvocationResults: [],
						}),
					} as any;
				}
				return originalGet(metric);
			});

		const results: {
			evalCaseResults: { finalEvalStatus: EvalStatus }[];
		}[] = [];
		for await (const evalResult of service.evaluate({
			inferenceResults: [
				[
					{
						invocationId: "empty-metric-expected",
						userContent: { role: "user", parts: [{ text: "q" }] },
						finalResponse: {
							role: "model",
							parts: [{ text: "a" }],
						},
						creationTimestamp: 1,
					},
					{
						invocationId: "empty-metric-actual",
						userContent: { role: "user", parts: [{ text: "q" }] },
						finalResponse: {
							role: "model",
							parts: [{ text: "a" }],
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

		expect(results[0].evalCaseResults[0].finalEvalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
		spy.mockRestore();
	});

	it("treats falsy ask responses as empty text", async () => {
		const service = new LocalEvalService({
			name: "stub-agent",
			ask: async () => null,
		} as any);

		const evalCase: EvalCase = {
			evalId: "null-resp",
			conversation: [
				{
					userContent: { role: "user", parts: [{ text: "hi" }] },
					creationTimestamp: 1,
				},
			],
		};

		let text = "unset";
		for await (const batch of service.performInference({
			evalSetId: "set-1",
			evalCases: [makeEvalSet(evalCase)],
		})) {
			text = batch[0].finalResponse?.parts?.[0]?.text ?? "missing";
		}

		expect(text).toBe("");
	});

	it("embeds Unknown error when a non-Error is thrown", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const service = new LocalEvalService({
			name: "failing-agent",
			ask: async () => {
				throw "string-boom";
			},
		} as any);

		const evalCase: EvalCase = {
			evalId: "non-error",
			conversation: [
				{
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

		expect(actualText).toContain("Error: Unknown error");
		errorSpy.mockRestore();
	});

	it("skips expected invocations when conversation turns omit finalResponse", async () => {
		const ask = vi.fn(async () => "live");
		const service = new LocalEvalService({
			name: "stub-agent",
			ask,
		} as any);

		const evalCase: EvalCase = {
			evalId: "no-expected",
			conversation: [
				{
					userContent: { role: "user", parts: [{ text: "hi" }] },
					creationTimestamp: 1,
				},
			],
		};

		const batches: { invocationId?: string }[][] = [];
		for await (const batch of service.performInference({
			evalSetId: "set-1",
			evalCases: [makeEvalSet(evalCase)],
		})) {
			batches.push(batch);
		}

		expect(batches[0]).toHaveLength(1);
		expect(batches[0][0].invocationId).toBe("no-expected-0");
		expect(ask).toHaveBeenCalledOnce();
	});

	it("yields one batch per eval case across multiple sets", async () => {
		const ask = vi.fn(async () => "ok");
		const service = new LocalEvalService({
			name: "stub-agent",
			ask,
		} as any);

		const caseA: EvalCase = {
			evalId: "A",
			conversation: [
				{
					userContent: { role: "user", parts: [{ text: "a" }] },
					creationTimestamp: 1,
				},
			],
		};
		const caseB: EvalCase = {
			evalId: "B",
			conversation: [
				{
					userContent: { role: "user", parts: [{ text: "b" }] },
					creationTimestamp: 1,
				},
			],
		};

		const batches: string[] = [];
		for await (const batch of service.performInference({
			evalSetId: "set-1",
			evalCases: [
				{ evalSetId: "s1", evalCases: [caseA], creationTimestamp: 1 },
				{ evalSetId: "s2", evalCases: [caseB], creationTimestamp: 1 },
			],
		})) {
			batches.push(batch[0].invocationId!);
		}

		expect(batches).toEqual(["A-0", "B-0"]);
		expect(ask).toHaveBeenCalledTimes(2);
	});

	it("uses the full invocation id when it has no hyphen", async () => {
		const service = new LocalEvalService({
			name: "unused",
			ask: async () => "unused",
		} as any);

		const spy = vi
			.spyOn(DEFAULT_METRIC_EVALUATOR_REGISTRY, "getEvaluator")
			.mockReturnValue({
				evaluateInvocations: async (
					actual: unknown[],
					expected: unknown[],
				) => ({
					overallScore: 1,
					overallEvalStatus: EvalStatus.PASSED,
					perInvocationResults: [
						{
							actualInvocation: actual[0],
							expectedInvocation: expected[0],
							score: 1,
							evalStatus: EvalStatus.PASSED,
						},
					],
				}),
			} as any);

		const results: { evalSetId: string }[] = [];
		for await (const evalResult of service.evaluate({
			inferenceResults: [
				[
					{
						invocationId: "plainid",
						userContent: { role: "user", parts: [{ text: "q" }] },
						finalResponse: {
							role: "model",
							parts: [{ text: "same" }],
						},
						creationTimestamp: 1,
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
		expect(results[0].evalSetId).toBe("plainid");
		spy.mockRestore();
	});

	it("evaluates multiple metrics for the same inference batch", async () => {
		const service = new LocalEvalService({
			name: "unused",
			ask: async () => "unused",
		} as any);

		const originalGet = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator.bind(
			DEFAULT_METRIC_EVALUATOR_REGISTRY,
		);
		const spy = vi
			.spyOn(DEFAULT_METRIC_EVALUATOR_REGISTRY, "getEvaluator")
			.mockImplementation((metric) => {
				return {
					evaluateInvocations: async () => ({
						overallScore: metric.threshold,
						overallEvalStatus: EvalStatus.PASSED,
						perInvocationResults: [
							{
								actualInvocation: {
									invocationId: "case-actual",
									creationTimestamp: 1,
								},
								expectedInvocation: {
									invocationId: "case-expected",
									creationTimestamp: 1,
								},
								score: 1,
								evalStatus: EvalStatus.PASSED,
							},
						],
					}),
				} as any;
			});

		const results: {
			evalCaseResults: { evalMetricResultPerInvocation: unknown[] }[];
		}[] = [];
		for await (const evalResult of service.evaluate({
			inferenceResults: [
				[
					{
						invocationId: "case-expected",
						userContent: { role: "user", parts: [{ text: "q" }] },
						finalResponse: {
							role: "model",
							parts: [{ text: "a" }],
						},
						creationTimestamp: 1,
					},
					{
						invocationId: "case-actual",
						userContent: { role: "user", parts: [{ text: "q" }] },
						finalResponse: {
							role: "model",
							parts: [{ text: "a" }],
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
					{
						metricName: PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
						threshold: 1,
					},
				],
			},
		})) {
			results.push(evalResult);
		}

		expect(results[0].evalCaseResults).toHaveLength(2);
		expect(spy).toHaveBeenCalledTimes(2);
		spy.mockRestore();
		void originalGet;
	});

	it("reinitializes the runner when it was cleared before inference", async () => {
		const ask = vi.fn(async () => "rebuilt");
		const service = new LocalEvalService({
			name: "stub-agent",
			ask,
		} as any);
		(service as any).runner = undefined;

		const evalCase: EvalCase = {
			evalId: "rebuild",
			conversation: [
				{
					userContent: { role: "user", parts: [{ text: "hi" }] },
					creationTimestamp: 1,
				},
			],
		};

		let text = "";
		for await (const batch of service.performInference({
			evalSetId: "set-1",
			evalCases: [makeEvalSet(evalCase)],
		})) {
			text = batch[0].finalResponse?.parts?.[0]?.text ?? "";
		}

		expect(text).toBe("rebuilt");
		expect(ask).toHaveBeenCalledOnce();
	});

	it("merges multiple inference batches that share an eval id prefix", async () => {
		const service = new LocalEvalService({
			name: "unused",
			ask: async () => "unused",
		} as any);

		const spy = vi
			.spyOn(DEFAULT_METRIC_EVALUATOR_REGISTRY, "getEvaluator")
			.mockReturnValue({
				evaluateInvocations: async (
					actual: unknown[],
					expected: unknown[],
				) => ({
					overallScore: 1,
					overallEvalStatus: EvalStatus.PASSED,
					perInvocationResults: [
						{
							actualInvocation: actual[0],
							expectedInvocation: expected[0],
							score: 1,
							evalStatus: EvalStatus.PASSED,
						},
					],
				}),
			} as any);

		const results: {
			evalCaseResults: {
				evalMetricResultPerInvocation: unknown[];
			}[];
		}[] = [];
		for await (const evalResult of service.evaluate({
			inferenceResults: [
				[
					{
						invocationId: "shared-expected",
						userContent: { role: "user", parts: [{ text: "q1" }] },
						finalResponse: {
							role: "model",
							parts: [{ text: "e1" }],
						},
						creationTimestamp: 1,
					},
					{
						invocationId: "shared-0",
						userContent: { role: "user", parts: [{ text: "q1" }] },
						finalResponse: {
							role: "model",
							parts: [{ text: "a1" }],
						},
						creationTimestamp: 2,
					},
				],
				[
					{
						invocationId: "shared-expected",
						userContent: { role: "user", parts: [{ text: "q2" }] },
						finalResponse: {
							role: "model",
							parts: [{ text: "e2" }],
						},
						creationTimestamp: 3,
					},
					{
						invocationId: "shared-1",
						userContent: { role: "user", parts: [{ text: "q2" }] },
						finalResponse: {
							role: "model",
							parts: [{ text: "a2" }],
						},
						creationTimestamp: 4,
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
		expect(spy.mock.calls[0][0].metricName).toBe(
			PrebuiltMetrics.RESPONSE_MATCH_SCORE,
		);
		const evaluator = spy.mock.results[0].value as {
			evaluateInvocations: (
				actual: unknown[],
				expected: unknown[],
			) => Promise<unknown>;
		};
		expect(evaluator).toBeDefined();
		spy.mockRestore();
	});
});
