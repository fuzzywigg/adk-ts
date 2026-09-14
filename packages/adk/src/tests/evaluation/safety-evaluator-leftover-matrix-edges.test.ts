import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { SafetyEvaluatorV1 } from "../../evaluation/safety-evaluator";

function inv(text: string, ts = 1): Invocation {
	return {
		userContent: { parts: [{ text: `q-${text}` }] },
		finalResponse: { parts: [{ text }] },
		creationTimestamp: ts,
	};
}

describe("SafetyEvaluatorV1 leftover matrix edges", () => {
	const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
	const originalLocation = process.env.GOOGLE_CLOUD_LOCATION;

	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		process.env.GOOGLE_CLOUD_PROJECT = "test-project";
		process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
		vi.spyOn(Math, "random").mockReturnValue(1);
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

	describe("getMetricInfo stability", () => {
		it.each([
			{ label: "first call" },
			{ label: "second call" },
			{ label: "third call" },
		])("returns identical SAFETY_V1 shape on $label", ({ label: _ }) => {
			const info = SafetyEvaluatorV1.getMetricInfo();
			expect(info.metricName).toBe(PrebuiltMetrics.SAFETY_V1);
			expect(info.description).toMatch(/safety/i);
			expect(info.metricValueInfo.interval).toEqual({
				minValue: 0.0,
				maxValue: 1.0,
				openAtMin: false,
				openAtMax: false,
			});
		});

		it("two consecutive getMetricInfo calls are deep-equal", () => {
			expect(SafetyEvaluatorV1.getMetricInfo()).toEqual(
				SafetyEvaluatorV1.getMetricInfo(),
			);
		});
	});

	describe("threshold × empty invocations matrix", () => {
		it.each([
			0, 0.25, 0.5, 0.75, 0.9, 1,
		])("empty lists stay NOT_EVALUATED at threshold %s", async (threshold) => {
			const evaluator = new SafetyEvaluatorV1({
				metricName: PrebuiltMetrics.SAFETY_V1,
				threshold,
			});
			const result = await evaluator.evaluateInvocations([], []);
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
			expect(result.perInvocationResults).toEqual([]);
			expect(result.overallScore).toBeUndefined();
		});
	});

	describe("threshold × single invocation mock Vertex path", () => {
		it.each([
			{ threshold: 0, random: 1, expected: EvalStatus.PASSED, score: 1 },
			{ threshold: 0.5, random: 1, expected: EvalStatus.PASSED, score: 1 },
			{ threshold: 1, random: 1, expected: EvalStatus.PASSED, score: 1 },
			{ threshold: 0.9, random: 0, expected: EvalStatus.FAILED, score: 0.5 },
			{ threshold: 0.51, random: 0, expected: EvalStatus.FAILED, score: 0.5 },
			{ threshold: 0.5, random: 0, expected: EvalStatus.PASSED, score: 0.5 },
		])("threshold=$threshold random=$random → $expected", async ({
			threshold,
			random,
			expected,
			score,
		}) => {
			vi.spyOn(Math, "random").mockReturnValue(random);
			const evaluator = new SafetyEvaluatorV1({
				metricName: PrebuiltMetrics.SAFETY_V1,
				threshold,
			});
			const result = await evaluator.evaluateInvocations(
				[inv("safe")],
				[inv("safe")],
			);
			expect(result.overallScore).toBeCloseTo(score);
			expect(result.overallEvalStatus).toBe(expected);
			expect(result.perInvocationResults).toHaveLength(1);
		});
	});

	describe("threshold × multi-invocation averages", () => {
		it.each([
			{
				threshold: 0.5,
				randoms: [1, 1],
				avg: 1,
				status: EvalStatus.PASSED,
			},
			{
				threshold: 0.75,
				randoms: [1, 0],
				avg: 0.75,
				status: EvalStatus.PASSED,
			},
			{
				threshold: 0.8,
				randoms: [1, 0],
				avg: 0.75,
				status: EvalStatus.FAILED,
			},
			{
				threshold: 0.5,
				randoms: [0, 0, 0],
				avg: 0.5,
				status: EvalStatus.PASSED,
			},
			{
				threshold: 0.51,
				randoms: [0, 0],
				avg: 0.5,
				status: EvalStatus.FAILED,
			},
		])("avg=$avg vs threshold=$threshold → $status", async ({
			threshold,
			randoms,
			avg,
			status,
		}) => {
			let call = 0;
			vi.spyOn(Math, "random").mockImplementation(
				() => randoms[Math.min(call++, randoms.length - 1)],
			);
			const evaluator = new SafetyEvaluatorV1({
				metricName: PrebuiltMetrics.SAFETY_V1,
				threshold,
			});
			const actuals = randoms.map((_, i) => inv(`a${i}`, i + 1));
			const expecteds = randoms.map((_, i) => inv(`e${i}`, i + 1));
			const result = await evaluator.evaluateInvocations(actuals, expecteds);
			expect(result.perInvocationResults).toHaveLength(randoms.length);
			expect(result.overallScore).toBeCloseTo(avg);
			expect(result.overallEvalStatus).toBe(status);
		});
	});

	describe("env incomplete × threshold matrix → NOT_EVALUATED", () => {
		it.each([
			{
				label: "missing project",
				setup: () => {
					delete process.env.GOOGLE_CLOUD_PROJECT;
				},
			},
			{
				label: "missing location",
				setup: () => {
					delete process.env.GOOGLE_CLOUD_LOCATION;
				},
			},
			{
				label: "missing both",
				setup: () => {
					delete process.env.GOOGLE_CLOUD_PROJECT;
					delete process.env.GOOGLE_CLOUD_LOCATION;
				},
			},
		])("$label at multiple thresholds", async ({ setup }) => {
			setup();
			for (const threshold of [0, 0.5, 1]) {
				const evaluator = new SafetyEvaluatorV1({
					metricName: PrebuiltMetrics.SAFETY_V1,
					threshold,
				});
				const result = await evaluator.evaluateInvocations(
					[inv("x")],
					[inv("x")],
				);
				expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
				expect(result.perInvocationResults[0].evalStatus).toBe(
					EvalStatus.NOT_EVALUATED,
				);
			}
		});
	});

	describe("constructor stores multiple threshold values", () => {
		it.each([
			0, 0.1, 0.33, 0.5, 0.67, 0.99, 1,
		])("stores threshold %s on metric", (threshold) => {
			const evaluator = new SafetyEvaluatorV1({
				metricName: PrebuiltMetrics.SAFETY_V1,
				threshold,
			});
			expect((evaluator as any).metric.threshold).toBe(threshold);
			expect((evaluator as any).metric.metricName).toBe(
				PrebuiltMetrics.SAFETY_V1,
			);
		});
	});
});
