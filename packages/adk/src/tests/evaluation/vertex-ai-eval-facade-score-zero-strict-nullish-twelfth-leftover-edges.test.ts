import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { VertexAiEvalFacade } from "../../evaluation/vertex-ai-eval-facade";

function invocation(): Invocation {
	return {
		userContent: { parts: [{ text: "prompt" }] },
		finalResponse: { parts: [{ text: "response" }] },
		creationTimestamp: 1,
	};
}

/**
 * Twelfth leftover: `_getEvalStatus` uses `score !== null && !== undefined`,
 * so numeric `0` is evaluated (FAILED vs threshold) rather than NOT_EVALUATED.
 */
describe("vertex-ai-eval-facade score-zero strict-nullish twelfth leftover edges", () => {
	const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
	const originalLocation = process.env.GOOGLE_CLOUD_LOCATION;

	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		process.env.GOOGLE_CLOUD_PROJECT = "test-project";
		process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
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

	it("meanScore 0 vs threshold 0.5 is FAILED (0 is defined)", async () => {
		vi.spyOn(VertexAiEvalFacade as never, "_performEval").mockResolvedValue({
			summaryMetrics: [{ meanScore: 0 }],
		} as never);
		const facade = new VertexAiEvalFacade({
			threshold: 0.5,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});

		const result = await facade.evaluateInvocations(
			[invocation()],
			[invocation()],
		);

		expect(result.perInvocationResults[0].score).toBe(0);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("meanScore 0 vs threshold 0 is PASSED (0 >= 0)", async () => {
		vi.spyOn(VertexAiEvalFacade as never, "_performEval").mockResolvedValue({
			summaryMetrics: [{ meanScore: 0 }],
		} as never);
		const facade = new VertexAiEvalFacade({
			threshold: 0,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});

		const result = await facade.evaluateInvocations(
			[invocation()],
			[invocation()],
		);

		expect(result.perInvocationResults[0].score).toBe(0);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});
});
