import { afterEach, describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { SafetyEvaluatorV1 } from "../../evaluation/safety-evaluator";
import { VertexAiEvalFacade } from "../../evaluation/vertex-ai-eval-facade";

describe("SafetyEvaluatorV1 deepen edges (TOKENMAXX remainder)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("delegates evaluateInvocations to VertexAiEvalFacade and returns its result", async () => {
		const inv: Invocation = {
			userContent: { parts: [{ text: "q" }] },
			finalResponse: { parts: [{ text: "a" }] },
			creationTimestamp: 1,
		};
		const facadeResult = {
			overallScore: 0.91,
			overallEvalStatus: EvalStatus.PASSED,
			perInvocationResults: [
				{
					actualInvocation: inv,
					expectedInvocation: inv,
					score: 0.91,
					evalStatus: EvalStatus.PASSED,
				},
			],
		};

		const spy = vi
			.spyOn(VertexAiEvalFacade.prototype, "evaluateInvocations")
			.mockResolvedValue(facadeResult);

		const evaluator = new SafetyEvaluatorV1({
			metricName: PrebuiltMetrics.SAFETY_V1,
			threshold: 0.4,
		});
		const result = await evaluator.evaluateInvocations([inv], [inv]);

		expect(spy).toHaveBeenCalledOnce();
		expect(spy).toHaveBeenCalledWith([inv], [inv]);
		expect(result).toBe(facadeResult);
	});

	it("constructs the facade with the evaluator threshold each call", async () => {
		const seen: number[] = [];
		vi.spyOn(
			VertexAiEvalFacade.prototype,
			"evaluateInvocations",
		).mockImplementation(async function (this: VertexAiEvalFacade) {
			seen.push((this as any).threshold);
			return {
				overallScore: 1,
				overallEvalStatus: EvalStatus.PASSED,
				perInvocationResults: [],
			};
		});

		for (const threshold of [0.1, 0.55, 0.99]) {
			const evaluator = new SafetyEvaluatorV1({
				metricName: PrebuiltMetrics.SAFETY_V1,
				threshold,
			});
			await evaluator.evaluateInvocations([], []);
		}

		expect(seen).toEqual([0.1, 0.55, 0.99]);
	});

	it("passes through NOT_EVALUATED facade results without rewriting", async () => {
		const facadeResult = {
			overallScore: undefined,
			overallEvalStatus: EvalStatus.NOT_EVALUATED,
			perInvocationResults: [],
		};
		vi.spyOn(
			VertexAiEvalFacade.prototype,
			"evaluateInvocations",
		).mockResolvedValue(facadeResult);

		const evaluator = new SafetyEvaluatorV1({
			metricName: PrebuiltMetrics.SAFETY_V1,
			threshold: 0.5,
		});
		expect(await evaluator.evaluateInvocations([], [])).toEqual(facadeResult);
	});

	it("passes through multi-invocation FAILED facade payloads", async () => {
		const invA: Invocation = {
			userContent: { parts: [{ text: "q1" }] },
			finalResponse: { parts: [{ text: "a1" }] },
			creationTimestamp: 1,
		};
		const invB: Invocation = {
			userContent: { parts: [{ text: "q2" }] },
			finalResponse: { parts: [{ text: "a2" }] },
			creationTimestamp: 2,
		};
		const facadeResult = {
			overallScore: 0.4,
			overallEvalStatus: EvalStatus.FAILED,
			perInvocationResults: [
				{
					actualInvocation: invA,
					expectedInvocation: invA,
					score: 0.2,
					evalStatus: EvalStatus.FAILED,
				},
				{
					actualInvocation: invB,
					expectedInvocation: invB,
					score: 0.6,
					evalStatus: EvalStatus.PASSED,
				},
			],
		};
		vi.spyOn(
			VertexAiEvalFacade.prototype,
			"evaluateInvocations",
		).mockResolvedValue(facadeResult);

		const evaluator = new SafetyEvaluatorV1({
			metricName: PrebuiltMetrics.SAFETY_V1,
			threshold: 0.5,
		});
		const result = await evaluator.evaluateInvocations(
			[invA, invB],
			[invA, invB],
		);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		expect(result.perInvocationResults).toHaveLength(2);
	});

	it("getMetricInfo documents SAFETY_V1 closed unit interval", () => {
		const info = SafetyEvaluatorV1.getMetricInfo();
		expect(info.metricName).toBe(PrebuiltMetrics.SAFETY_V1);
		expect(info.description).toMatch(/harmlessness/i);
		expect(info.metricValueInfo?.interval).toEqual({
			minValue: 0.0,
			maxValue: 1.0,
			openAtMin: false,
			openAtMax: false,
		});
	});

	it("propagates facade rejection errors", async () => {
		vi.spyOn(
			VertexAiEvalFacade.prototype,
			"evaluateInvocations",
		).mockRejectedValue(new Error("vertex-down"));

		const evaluator = new SafetyEvaluatorV1({
			metricName: PrebuiltMetrics.SAFETY_V1,
			threshold: 0.5,
		});
		await expect(evaluator.evaluateInvocations([], [])).rejects.toThrow(
			"vertex-down",
		);
	});
});
