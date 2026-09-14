import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { EvalStatus } from "../../evaluation/evaluator";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { ResponseEvaluator } from "../../evaluation/response-evaluator";

function invocation(
	finalResponse?: { parts: Array<{ text?: string; inlineData?: unknown }> },
	overrides: Partial<Invocation> = {},
): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse: finalResponse
			? { role: "model", parts: finalResponse.parts }
			: undefined,
		...overrides,
	};
}

describe("ResponseEvaluator leftover edges", () => {
	describe("constructor unsupported metric", () => {
		it("throws for SAFETY_V1 metric name", () => {
			expect(
				() =>
					new ResponseEvaluator({
						metricName: PrebuiltMetrics.SAFETY_V1,
						threshold: 0.5,
					}),
			).toThrow(/not supported/i);
		});

		it("throws for arbitrary unknown metric strings", () => {
			expect(
				() =>
					new ResponseEvaluator({
						metricName: "totally_unknown_metric",
						threshold: 1,
					}),
			).toThrow(/not supported/i);
		});

		it("throws for FINAL_RESPONSE_MATCH_V2 metric name", () => {
			expect(
				() =>
					new ResponseEvaluator({
						metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
						threshold: 0.5,
					}),
			).toThrow(/not supported/i);
		});
	});

	describe("getMetricInfo", () => {
		it("returns RESPONSE_EVALUATION_SCORE info with [1,5] interval", () => {
			const info = ResponseEvaluator.getMetricInfo(
				PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
			);
			expect(info.metricName).toBe(PrebuiltMetrics.RESPONSE_EVALUATION_SCORE);
			expect(info.description).toContain("[1,5]");
			expect(info.metricValueInfo.interval?.minValue).toBe(1);
			expect(info.metricValueInfo.interval?.maxValue).toBe(5);
		});

		it("returns RESPONSE_MATCH_SCORE info with [0,1] interval", () => {
			const info = ResponseEvaluator.getMetricInfo(
				PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			);
			expect(info.metricName).toBe(PrebuiltMetrics.RESPONSE_MATCH_SCORE);
			expect(info.description).toContain("Rouge_1");
			expect(info.metricValueInfo.interval?.minValue).toBe(0);
			expect(info.metricValueInfo.interval?.maxValue).toBe(1);
		});

		it("throws for unsupported metric in getMetricInfo", () => {
			expect(() =>
				ResponseEvaluator.getMetricInfo(
					PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
				),
			).toThrow(/not supported/i);
		});

		it("throws for empty string metric name in getMetricInfo", () => {
			expect(() =>
				ResponseEvaluator.getMetricInfo("" as PrebuiltMetrics),
			).toThrow(/not supported/i);
		});
	});

	describe("Rouge path — missing finalResponse", () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});

		it("returns NOT_EVALUATED when actual finalResponse is missing", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation()],
				[invocation({ parts: [{ text: "expected" }] })],
			);
			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
			expect(result.perInvocationResults[0].score).toBeUndefined();
		});

		it("returns NOT_EVALUATED when expected finalResponse is missing", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation({ parts: [{ text: "actual" }] })],
				[invocation()],
			);
			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
		});

		it("returns NOT_EVALUATED when both finalResponses are missing", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation()],
				[invocation()],
			);
			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
			expect(result.overallScore).toBeUndefined();
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});
	});

	describe("Rouge path — whitespace-only and empty text", () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});

		it("scores zero for whitespace-only actual text", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation({ parts: [{ text: "   \t\n  " }] })],
				[invocation({ parts: [{ text: "hello world" }] })],
			);
			expect(result.perInvocationResults[0].score).toBe(0);
			expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
		});

		it("scores zero for whitespace-only expected text", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation({ parts: [{ text: "hello" }] })],
				[invocation({ parts: [{ text: "  " }] })],
			);
			expect(result.perInvocationResults[0].score).toBe(0);
		});

		it("scores zero for empty string text on both sides", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation({ parts: [{ text: "" }] })],
				[invocation({ parts: [{ text: "" }] })],
			);
			expect(result.overallScore).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});
	});

	describe("Rouge path — extractText part filtering", () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});

		it("filters parts with text:'' before joining", async () => {
			const sparse = invocation({
				parts: [{ text: "" }, { text: "keep" }, { text: "" }],
			});
			const result = await evaluator.evaluateInvocations(
				[sparse],
				[invocation({ parts: [{ text: "keep" }] })],
			);
			expect(result.overallScore).toBe(1);
		});

		it("returns empty extractText for non-text parts only", async () => {
			const nonText = invocation({
				parts: [{ inlineData: { data: "x", mimeType: "text/plain" } }],
			});
			const result = await evaluator.evaluateInvocations(
				[nonText],
				[invocation({ parts: [{ text: "hello" }] })],
			);
			expect(result.perInvocationResults[0].score).toBe(0);
		});

		it("uses p.text || '' for undefined text fields", async () => {
			const missingText = invocation({
				parts: [{ text: undefined }, { text: "visible" }],
			});
			const result = await evaluator.evaluateInvocations(
				[missingText],
				[invocation({ parts: [{ text: "visible" }] })],
			);
			expect(result.overallScore).toBe(1);
		});

		it("joins multi-part text with spaces", async () => {
			const multi = invocation({
				parts: [{ text: "hello" }, { text: "world" }],
			});
			const single = invocation({ parts: [{ text: "hello world" }] });
			const result = await evaluator.evaluateInvocations([multi], [single]);
			expect(result.overallScore).toBe(1);
		});
	});

	describe("Rouge path — length mismatch throw", () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});

		it("throws when actual has more invocations than expected", async () => {
			await expect(
				evaluator.evaluateInvocations(
					[
						invocation({ parts: [{ text: "a" }] }),
						invocation({ parts: [{ text: "b" }] }),
					],
					[invocation({ parts: [{ text: "a" }] })],
				),
			).rejects.toThrow(/must match/i);
		});

		it("throws when expected has more invocations than actual", async () => {
			await expect(
				evaluator.evaluateInvocations(
					[invocation({ parts: [{ text: "a" }] })],
					[
						invocation({ parts: [{ text: "a" }] }),
						invocation({ parts: [{ text: "b" }] }),
					],
				),
			).rejects.toThrow(/must match/i);
		});
	});

	describe("Rouge path — empty invocations list", () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});

		it("returns overallScore undefined and FAILED for empty lists", async () => {
			const result = await evaluator.evaluateInvocations([], []);
			expect(result.overallScore).toBeUndefined();
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
			expect(result.perInvocationResults).toEqual([]);
		});
	});

	describe("Rouge path — threshold boundaries", () => {
		it("passes when fmeasure equals threshold exactly", async () => {
			const exact = new ResponseEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
				threshold: 0.8,
			});
			const result = await exact.evaluateInvocations(
				[invocation({ parts: [{ text: "a b c" }] })],
				[invocation({ parts: [{ text: "a b" }] })],
			);
			expect(result.perInvocationResults[0].score).toBeCloseTo(0.8);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});

		it("fails when fmeasure is below threshold", async () => {
			const strict = new ResponseEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
				threshold: 0.81,
			});
			const result = await strict.evaluateInvocations(
				[invocation({ parts: [{ text: "a b c" }] })],
				[invocation({ parts: [{ text: "a b" }] })],
			);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("passes zero score when threshold is 0", async () => {
			const permissive = new ResponseEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
				threshold: 0,
			});
			const result = await permissive.evaluateInvocations(
				[invocation({ parts: [{ text: "zzz" }] })],
				[invocation({ parts: [{ text: "yyy" }] })],
			);
			expect(result.overallScore).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});
	});

	describe("Rouge path — mixed NOT_EVALUATED and scored rows", () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});

		it("averages only rows with defined scores", async () => {
			const result = await evaluator.evaluateInvocations(
				[invocation(), invocation({ parts: [{ text: "same" }] })],
				[
					invocation({ parts: [{ text: "x" }] }),
					invocation({ parts: [{ text: "same" }] }),
				],
			);
			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
			expect(result.perInvocationResults[1].score).toBe(1);
			expect(result.overallScore).toBe(1);
		});
	});

	describe("Vertex facade path — env and delegation", () => {
		const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
		const originalLocation = process.env.GOOGLE_CLOUD_LOCATION;

		beforeEach(() => {
			vi.spyOn(console, "warn").mockImplementation(() => undefined);
			vi.spyOn(console, "error").mockImplementation(() => undefined);
			process.env.GOOGLE_CLOUD_PROJECT = "test-project";
			process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
			vi.spyOn(Math, "random").mockReturnValue(0.5);
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

		it("delegates RESPONSE_EVALUATION_SCORE to VertexAiEvalFacade", async () => {
			const evaluator = new ResponseEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
				threshold: 0.5,
			});
			const result = await evaluator.evaluateInvocations(
				[invocation({ parts: [{ text: "actual" }] })],
				[invocation({ parts: [{ text: "expected" }] })],
			);
			expect(result.overallScore).toBeCloseTo(0.5 * 0.5 + 0.5);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});

		it("returns NOT_EVALUATED when cloud env is missing", async () => {
			delete process.env.GOOGLE_CLOUD_PROJECT;
			const evaluator = new ResponseEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
				threshold: 0.5,
			});
			const result = await evaluator.evaluateInvocations(
				[invocation({ parts: [{ text: "a" }] })],
				[invocation({ parts: [{ text: "b" }] })],
			);
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		});
	});
});
