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
});
