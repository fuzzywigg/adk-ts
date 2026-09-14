import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { VertexAiEvalFacade } from "../../evaluation/vertex-ai-eval-facade";

function invocation(opts: { user?: string; response?: string }): Invocation {
	return {
		userContent: { parts: [{ text: opts.user ?? "prompt" }] },
		finalResponse: { parts: [{ text: opts.response ?? "response" }] },
		creationTimestamp: 1,
	};
}

describe("VertexAiEvalFacade seventh leftover edges (post #158)", () => {
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

	it.each([
		{ label: "null envelope", value: null },
		{ label: "empty object", value: {} },
		{ label: "summaryMetrics undefined", value: { summaryMetrics: undefined } },
	])("_getScore returns undefined for $label → NOT_EVALUATED", async ({
		value,
	}) => {
		vi.spyOn(VertexAiEvalFacade as never, "_performEval").mockResolvedValue(
			value as never,
		);
		const facade = new VertexAiEvalFacade({
			threshold: 0.5,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});

		const result = await facade.evaluateInvocations(
			[invocation({ response: "act" })],
			[invocation({ response: "ref" })],
		);

		expect(result.perInvocationResults[0].score).toBeUndefined();
		expect(result.perInvocationResults[0].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
		expect(result.overallScore).toBeUndefined();
		expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
	});

	it("_getScore rejects non-number meanScore string", async () => {
		vi.spyOn(VertexAiEvalFacade as never, "_performEval").mockResolvedValue({
			summaryMetrics: [{ meanScore: "0.9" }],
		} as never);
		const facade = new VertexAiEvalFacade({
			threshold: 0.5,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});

		const result = await facade.evaluateInvocations(
			[invocation({})],
			[invocation({})],
		);
		expect(result.perInvocationResults[0].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
	});
});
