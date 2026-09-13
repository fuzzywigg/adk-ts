import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { EvalStatus } from "../../evaluation/evaluator";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { ResponseEvaluator } from "../../evaluation/response-evaluator";

function invocation(text?: string): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse:
			text !== undefined ? { role: "model", parts: [{ text }] } : undefined,
	};
}

describe("ResponseEvaluator", () => {
	it("rejects unsupported metrics in the constructor", () => {
		expect(
			() =>
				new ResponseEvaluator({
					metricName: PrebuiltMetrics.SAFETY_V1,
					threshold: 0.5,
				}),
		).toThrow(/not supported/i);
	});

	it("exposes RESPONSE_MATCH_SCORE metric info", () => {
		const info = ResponseEvaluator.getMetricInfo(
			PrebuiltMetrics.RESPONSE_MATCH_SCORE,
		);
		expect(info.metricName).toBe(PrebuiltMetrics.RESPONSE_MATCH_SCORE);
		expect(info.metricValueInfo.interval?.minValue).toBe(0);
		expect(info.metricValueInfo.interval?.maxValue).toBe(1);
		expect(info.metricValueInfo.interval?.openAtMin).toBe(false);
		expect(info.metricValueInfo.interval?.openAtMax).toBe(false);
	});

	it("exposes RESPONSE_EVALUATION_SCORE metric info", () => {
		const info = ResponseEvaluator.getMetricInfo(
			PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
		);
		expect(info.metricName).toBe(PrebuiltMetrics.RESPONSE_EVALUATION_SCORE);
		expect(info.metricValueInfo.interval?.minValue).toBe(1);
		expect(info.metricValueInfo.interval?.maxValue).toBe(5);
	});

	it("rejects getMetricInfo for unsupported metrics", () => {
		expect(() =>
			ResponseEvaluator.getMetricInfo(PrebuiltMetrics.SAFETY_V1),
		).toThrow(/not supported/i);
	});

	describe("Rouge RESPONSE_MATCH_SCORE path", () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});

		it("scores identical responses as a perfect match", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("The quick brown fox")],
				[invocation("The quick brown fox")],
			);

			expect(result.overallScore).toBe(1);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
			expect(result.perInvocationResults[0].score).toBe(1);
			expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		});

		it("scores disjoint responses as failed", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("alpha beta")],
				[invocation("completely different words")],
			);

			expect(result.overallScore).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("scores empty texts as zero", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("")],
				[invocation("")],
			);

			expect(result.overallScore).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("returns NOT_EVALUATED when finalResponse is missing", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation()],
				[invocation("expected")],
			);

			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
			expect(result.perInvocationResults[0].score).toBeUndefined();
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("throws when invocation lengths mismatch", async () => {
			await expect(
				evaluator.evaluateInvocations(
					[invocation("a"), invocation("b")],
					[invocation("a")],
				),
			).rejects.toThrow(/must match/i);
		});

		it("aggregates average score across invocations", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("shared token here"), invocation("zzz")],
				[invocation("shared token there"), invocation("yyy")],
			);

			expect(result.perInvocationResults).toHaveLength(2);
			expect(result.overallScore).toBeGreaterThan(0);
			expect(result.overallScore).toBeLessThan(1);
			expect(result.overallScore).toBe(
				((result.perInvocationResults[0].score as number) +
					(result.perInvocationResults[1].score as number)) /
					2,
			);
		});

		it("scores asymmetric unigram overlap with exact Rouge-1 F1", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("a b c")],
				[invocation("a b")],
			);

			expect(result.perInvocationResults[0].score).toBeCloseTo(0.8);
			expect(result.overallScore).toBeCloseTo(0.8);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});

		it("joins multi-part finalResponse text with spaces before scoring", async () => {
			const multiPartActual: Invocation = {
				userContent: { parts: [{ text: "hi" }] },
				creationTimestamp: 1,
				finalResponse: {
					role: "model",
					parts: [{ text: "hello" }, { text: "world" }],
				},
			};
			const multiPartExpected: Invocation = {
				userContent: { parts: [{ text: "hi" }] },
				creationTimestamp: 1,
				finalResponse: {
					role: "model",
					parts: [{ text: "hello world" }],
				},
			};

			const result = await evaluator.evaluateInvocations(
				[multiPartActual],
				[multiPartExpected],
			);
			expect(result.overallScore).toBe(1);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});

		it("scores response that is a strict subset with lower precision than recall", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("a b")],
				[invocation("a b c")],
			);
			expect(result.perInvocationResults[0].score).toBeCloseTo(0.8);
		});

		it("treats punctuation-only differences as a perfect token match", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation("Hello, World!")],
				[invocation("hello world")],
			);
			expect(result.overallScore).toBe(1);
		});
	});

	describe("RESPONSE_EVALUATION_SCORE Vertex facade path", () => {
		const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
		const originalLocation = process.env.GOOGLE_CLOUD_LOCATION;

		beforeEach(() => {
			vi.spyOn(console, "warn").mockImplementation(() => undefined);
			vi.spyOn(console, "error").mockImplementation(() => undefined);
			process.env.GOOGLE_CLOUD_PROJECT = "test-project";
			process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
			vi.spyOn(Math, "random").mockReturnValue(0.6);
		});

		afterEach(() => {
			vi.restoreAllMocks();
			if (originalProject === undefined) {
				delete process.env.GOOGLE_CLOUD_PROJECT;
			} else {
				process.env.GOOGLE_CLOUD_PROJECT = originalProject;
			}
			if (originalLocation === undefined) {
				delete process.env.GOOGLE_CLOUD_LOCATION;
			} else {
				process.env.GOOGLE_CLOUD_LOCATION = originalLocation;
			}
		});

		it("delegates coherence scoring to VertexAiEvalFacade", async () => {
			const evaluator = new ResponseEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
				threshold: 0.5,
			});
			const result = await evaluator.evaluateInvocations(
				[invocation("actual answer")],
				[invocation("expected answer")],
			);

			expect(result.overallScore).toBeCloseTo(0.6 * 0.5 + 0.5);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
			expect(result.perInvocationResults).toHaveLength(1);
		});

		it("returns NOT_EVALUATED when cloud project env is missing", async () => {
			delete process.env.GOOGLE_CLOUD_PROJECT;
			const evaluator = new ResponseEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
				threshold: 0.5,
			});
			const result = await evaluator.evaluateInvocations(
				[invocation("a")],
				[invocation("b")],
			);
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		});
	});
});
