import { AgentBuilder } from "@adk/agents";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
	vi.restoreAllMocks();
});

describe("LocalEvalService leftover matrix edges", () => {
	describe("parallelism constructor default", () => {
		it.each([
			{ args: undefined, expected: 4 },
			{ args: 1, expected: 1 },
			{ args: 4, expected: 4 },
			{ args: 16, expected: 16 },
		])("parallelism=$expected", ({ args, expected }) => {
			const agent = { name: "a", ask: async () => "ok" } as any;
			const service =
				args === undefined
					? new LocalEvalService(agent)
					: new LocalEvalService(agent, args);
			expect((service as any).parallelism).toBe(expected);
		});
	});

	describe("resultsByCase.get || [] grouping: hyphen vs no-hyphen Cartesian", () => {
		it.each([
			{
				id: "plain",
				expectedKey: "plain",
			},
			{
				id: "case-0",
				expectedKey: "case",
			},
			{
				id: "multi-dash-case-actual",
				expectedKey: "multi-dash-case",
			},
			{
				id: "a-b-c-d",
				expectedKey: "a-b-c",
			},
		])("groups $id under evalId=$expectedKey", async ({ id, expectedKey }) => {
			const service = new LocalEvalService({
				name: "stub",
				ask: async () => "unused",
			} as any);

			const getEvaluator = vi
				.spyOn(DEFAULT_METRIC_EVALUATOR_REGISTRY, "getEvaluator")
				.mockReturnValue({
					evaluateInvocations: async () => ({
						overallScore: 1,
						overallEvalStatus: EvalStatus.PASSED,
						perInvocationResults: [
							{
								actualInvocation: { creationTimestamp: 1 } as any,
								expectedInvocation: { creationTimestamp: 1 } as any,
								score: 1,
								evalStatus: EvalStatus.PASSED,
							},
						],
					}),
				} as any);

			const results: string[] = [];
			for await (const evalResult of service.evaluate({
				inferenceResults: [
					[
						{
							invocationId: id,
							userContent: { parts: [{ text: "u" }] },
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
				results.push(evalResult.evalSetId);
			}

			expect(results).toEqual([expectedKey]);
			getEvaluator.mockRestore();
		});

		it("merges batches that share the same hyphen-stripped prefix", async () => {
			const service = new LocalEvalService({
				name: "stub",
				ask: async () => "unused",
			} as any);
			const seen: string[] = [];
			vi.spyOn(
				DEFAULT_METRIC_EVALUATOR_REGISTRY,
				"getEvaluator",
			).mockReturnValue({
				evaluateInvocations: async (actual: any[]) => {
					seen.push(...actual.map((a) => a.invocationId));
					return {
						overallScore: 1,
						overallEvalStatus: EvalStatus.PASSED,
						perInvocationResults: [],
					};
				},
			} as any);

			const yielded: string[] = [];
			for await (const r of service.evaluate({
				inferenceResults: [
					[
						{
							invocationId: "shared-0",
							userContent: { parts: [{ text: "a" }] },
							creationTimestamp: 1,
						},
					],
					[
						{
							invocationId: "shared-1",
							userContent: { parts: [{ text: "b" }] },
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
				yielded.push(r.evalSetId);
			}

			expect(yielded).toEqual(["shared"]);
			expect(seen).toEqual(["shared-0", "shared-1"]);
		});
	});

	describe("skip when invocationId missing", () => {
		it.each([
			{ label: "undefined", invocationId: undefined },
			{ label: "empty string", invocationId: "" },
		])("skips batch with $label invocationId", async ({ invocationId }) => {
			const service = new LocalEvalService({
				name: "stub",
				ask: async () => "x",
			} as any);
			const getEvaluator = vi.spyOn(
				DEFAULT_METRIC_EVALUATOR_REGISTRY,
				"getEvaluator",
			);

			const results: unknown[] = [];
			for await (const r of service.evaluate({
				inferenceResults: [
					[
						{
							invocationId,
							userContent: { parts: [{ text: "u" }] },
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
				results.push(r);
			}

			expect(results).toEqual([]);
			expect(getEvaluator).not.toHaveBeenCalled();
			getEvaluator.mockRestore();
		});
	});

	describe('response || "" when ask returns falsy', () => {
		it.each([
			{ value: "", expected: "" },
			{ value: null, expected: "" },
			{ value: undefined, expected: "" },
			{ value: 0, expected: "" },
			{ value: false, expected: "" },
			{ value: "kept", expected: "kept" },
		])("ask→$value embeds text='$expected'", async ({ value, expected }) => {
			const service = new LocalEvalService({
				name: "falsy-agent",
				ask: async () => value as any,
			} as any);

			const evalCase: EvalCase = {
				evalId: "falsy",
				conversation: [
					{
						invocationId: "x",
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
			expect(text).toBe(expected);
		});
	});

	describe("Error.message vs Unknown error for non-Error throws", () => {
		it.each([
			{ thrown: new Error("typed boom"), expected: "Error: typed boom" },
			{ thrown: "string fail", expected: "Error: Unknown error" },
			{ thrown: 42, expected: "Error: Unknown error" },
			{ thrown: { code: 500 }, expected: "Error: Unknown error" },
			{ thrown: null, expected: "Error: Unknown error" },
		])("embeds $expected", async ({ thrown, expected }) => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			const service = new LocalEvalService({
				name: "throw-agent",
				ask: async () => {
					throw thrown;
				},
			} as any);

			const evalCase: EvalCase = {
				evalId: "throwCase",
				conversation: [
					{
						invocationId: "x",
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
			expect(text).toBe(expected);
		});
	});

	describe("AgentBuilder fail → mock ask path", () => {
		it("spies AgentBuilder.create and falls back to mock ask", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const createSpy = vi.spyOn(AgentBuilder, "create").mockReturnValue({
				withModel: () => ({
					withDescription: () => ({
						build: async () => {
							throw new Error("builder down");
						},
					}),
				}),
			} as any);

			const service = new LocalEvalService({ name: "no-ask" } as any);
			await (service as any).initializeRunner();

			expect(createSpy).toHaveBeenCalledWith("eval_agent");
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("Failed to create AgentBuilder runner"),
				expect.any(Error),
			);

			const reply = await (service as any).runner.ask("ping");
			expect(reply).toBe("Mock response to: ping");
		});
	});

	describe("sessionInput initializeSession / setSessionState / console.log / catch", () => {
		it("calls initializeSession when present", async () => {
			const initializeSession = vi.fn(async () => undefined);
			const service = new LocalEvalService({
				name: "sess",
				ask: async () => "ok",
				initializeSession,
			} as any);

			const evalCase: EvalCase = {
				evalId: "s1",
				sessionInput: { state: { k: 1 } } as any,
				conversation: [
					{
						invocationId: "x",
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
			expect(initializeSession).toHaveBeenCalledWith({ state: { k: 1 } });
		});

		it("falls back to setSessionState when initializeSession absent", async () => {
			const setSessionState = vi.fn(async () => undefined);
			const service = new LocalEvalService({
				name: "sess2",
				ask: async () => "ok",
				setSessionState,
			} as any);

			const evalCase: EvalCase = {
				evalId: "s2",
				sessionInput: { state: { z: 9 } } as any,
				conversation: [
					{
						invocationId: "x",
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
			expect(setSessionState).toHaveBeenCalledWith({ state: { z: 9 } });
		});

		it("console.log fallback when neither session hook exists", async () => {
			const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const service = new LocalEvalService({
				name: "sess3",
				ask: async () => "ok",
			} as any);

			const sessionInput = { state: { only: "log" } };
			const evalCase: EvalCase = {
				evalId: "s3",
				sessionInput: sessionInput as any,
				conversation: [
					{
						invocationId: "x",
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
			expect(logSpy).toHaveBeenCalledWith(
				"Session input provided for s3:",
				sessionInput,
			);
		});

		it.each([
			{ thrown: new Error("init fail"), via: "Error" },
			{ thrown: "plain", via: "string" },
		])("warns and continues when session init throws $via", async ({
			thrown,
		}) => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const service = new LocalEvalService({
				name: "sess-fail",
				ask: async () => "recovered",
				initializeSession: async () => {
					throw thrown;
				},
			} as any);

			const evalCase: EvalCase = {
				evalId: "sfail",
				sessionInput: { state: {} } as any,
				conversation: [
					{
						invocationId: "x",
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
			expect(text).toBe("recovered");
			expect(warnSpy).toHaveBeenCalledWith(
				"Failed to initialize session for sfail:",
				thrown,
			);
		});
	});

	describe("multi-metric evaluate batches", () => {
		it("invokes each metric evaluator once per grouped case", async () => {
			const service = new LocalEvalService({
				name: "multi",
				ask: async () => "x",
			} as any);

			const calls: string[] = [];
			vi.spyOn(
				DEFAULT_METRIC_EVALUATOR_REGISTRY,
				"getEvaluator",
			).mockImplementation(
				(metric: any) =>
					({
						evaluateInvocations: async () => {
							calls.push(metric.metricName);
							return {
								overallScore: 1,
								overallEvalStatus: EvalStatus.PASSED,
								perInvocationResults: [
									{
										actualInvocation: { creationTimestamp: 1 },
										expectedInvocation: { creationTimestamp: 1 },
										score: 1,
										evalStatus: EvalStatus.PASSED,
									},
								],
							};
						},
					}) as any,
			);

			const metrics = [
				{ metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE, threshold: 0.5 },
				{ metricName: PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE, threshold: 1 },
				{ metricName: PrebuiltMetrics.SAFETY_V1, threshold: 0.8 },
			];

			let caseCount = 0;
			for await (const r of service.evaluate({
				inferenceResults: [
					[
						{
							invocationId: "mcase-0",
							userContent: { parts: [{ text: "u" }] },
							creationTimestamp: 1,
						},
					],
				],
				evaluateConfig: { evalMetrics: metrics },
			})) {
				caseCount += 1;
				expect(r.evalCaseResults).toHaveLength(3);
			}

			expect(caseCount).toBe(1);
			expect(calls).toEqual(metrics.map((m) => m.metricName));
		});
	});
});
