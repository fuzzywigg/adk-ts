import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { SafetyEvaluatorV1 } from "../../evaluation/safety-evaluator";

describe("SafetyEvaluatorV1", () => {
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

	it("exposes SAFETY_V1 metric info", () => {
		const info = SafetyEvaluatorV1.getMetricInfo();
		expect(info.metricName).toBe(PrebuiltMetrics.SAFETY_V1);
		expect(info.description).toMatch(/safety/i);
		expect(info.description).toMatch(/harmlessness/i);
		expect(info.metricValueInfo?.interval).toEqual({
			minValue: 0.0,
			maxValue: 1.0,
			openAtMin: false,
			openAtMax: false,
		});
	});

	it("constructs with a metric threshold without calling Vertex", () => {
		const evaluator = new SafetyEvaluatorV1({
			metricName: PrebuiltMetrics.SAFETY_V1,
			threshold: 0.75,
		});
		expect(evaluator).toBeInstanceOf(SafetyEvaluatorV1);
	});

	it("delegates evaluateInvocations through VertexAiEvalFacade mock path", async () => {
		const evaluator = new SafetyEvaluatorV1({
			metricName: PrebuiltMetrics.SAFETY_V1,
			threshold: 0.5,
		});
		const inv: Invocation = {
			userContent: { parts: [{ text: "q" }] },
			finalResponse: { parts: [{ text: "a" }] },
			creationTimestamp: 1,
		};

		const result = await evaluator.evaluateInvocations([inv], [inv]);
		expect(result.overallScore).toBeCloseTo(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults).toHaveLength(1);
	});

	it("surfaces NOT_EVALUATED when Vertex credentials env is incomplete", async () => {
		delete process.env.GOOGLE_CLOUD_PROJECT;
		const evaluator = new SafetyEvaluatorV1({
			metricName: PrebuiltMetrics.SAFETY_V1,
			threshold: 0.5,
		});
		const inv: Invocation = {
			userContent: { parts: [{ text: "q" }] },
			finalResponse: { parts: [{ text: "a" }] },
			creationTimestamp: 1,
		};

		const result = await evaluator.evaluateInvocations([inv], [inv]);
		expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		expect(result.perInvocationResults[0].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
	});

	it("evaluates multiple invocations and returns one per-invocation row each", async () => {
		const evaluator = new SafetyEvaluatorV1({
			metricName: PrebuiltMetrics.SAFETY_V1,
			threshold: 0.5,
		});
		const invs: Invocation[] = [
			{
				userContent: { parts: [{ text: "q1" }] },
				finalResponse: { parts: [{ text: "a1" }] },
				creationTimestamp: 1,
			},
			{
				userContent: { parts: [{ text: "q2" }] },
				finalResponse: { parts: [{ text: "a2" }] },
				creationTimestamp: 2,
			},
			{
				userContent: { parts: [{ text: "q3" }] },
				finalResponse: { parts: [{ text: "a3" }] },
				creationTimestamp: 3,
			},
		];

		const result = await evaluator.evaluateInvocations(invs, invs);
		expect(result.perInvocationResults).toHaveLength(3);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("returns empty per-invocation results for empty invocation lists", async () => {
		const evaluator = new SafetyEvaluatorV1({
			metricName: PrebuiltMetrics.SAFETY_V1,
			threshold: 0.5,
		});
		const result = await evaluator.evaluateInvocations([], []);
		expect(result.perInvocationResults).toEqual([]);
	});

	it("surfaces NOT_EVALUATED when GOOGLE_CLOUD_LOCATION is missing", async () => {
		delete process.env.GOOGLE_CLOUD_LOCATION;
		const evaluator = new SafetyEvaluatorV1({
			metricName: PrebuiltMetrics.SAFETY_V1,
			threshold: 0.5,
		});
		const inv: Invocation = {
			userContent: { parts: [{ text: "q" }] },
			finalResponse: { parts: [{ text: "a" }] },
			creationTimestamp: 1,
		};
		const result = await evaluator.evaluateInvocations([inv], [inv]);
		expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
	});

	it("respects a high threshold against low mock scores", async () => {
		vi.spyOn(Math, "random").mockReturnValue(0);
		const evaluator = new SafetyEvaluatorV1({
			metricName: PrebuiltMetrics.SAFETY_V1,
			threshold: 0.99,
		});
		const inv: Invocation = {
			userContent: { parts: [{ text: "q" }] },
			finalResponse: { parts: [{ text: "a" }] },
			creationTimestamp: 1,
		};
		const result = await evaluator.evaluateInvocations([inv], [inv]);
		expect(result.overallScore).toBeDefined();
		if ((result.overallScore as number) < 0.99) {
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		}
	});

	it("metric info description mentions desirable values closer to 1", () => {
		const info = SafetyEvaluatorV1.getMetricInfo();
		expect(info.description).toMatch(/closer/);
		expect(info.description).toMatch(/1/);
	});

	it("constructs with threshold 0 and still evaluates", async () => {
		const evaluator = new SafetyEvaluatorV1({
			metricName: PrebuiltMetrics.SAFETY_V1,
			threshold: 0,
		});
		const inv: Invocation = {
			userContent: { parts: [{ text: "q" }] },
			finalResponse: { parts: [{ text: "a" }] },
			creationTimestamp: 1,
		};
		const result = await evaluator.evaluateInvocations([inv], [inv]);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});
});
