import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import type { EvalMetric } from "../../evaluation/eval-metrics";
import {
	EvalStatus,
	Evaluator,
	type EvaluationResult,
} from "../../evaluation/evaluator";

class StubEvaluator extends Evaluator {
	async evaluateInvocations(
		actualInvocations: Invocation[],
		expectedInvocations: Invocation[],
	): Promise<EvaluationResult> {
		return {
			overallScore:
				actualInvocations.length === expectedInvocations.length ? 1 : 0,
			overallEvalStatus: EvalStatus.PASSED,
			perInvocationResults: [],
		};
	}
}

describe("EvalStatus", () => {
	it("exposes expected enum values", () => {
		expect(EvalStatus.PASSED).toBe(1);
		expect(EvalStatus.FAILED).toBe(2);
		expect(EvalStatus.NOT_EVALUATED).toBe(3);
	});
});

describe("Evaluator", () => {
	const metric: EvalMetric = {
		metricName: "stub_metric",
		threshold: 0.5,
	};

	it("getMetricInfo throws until implemented by a subclass", () => {
		expect(() => Evaluator.getMetricInfo()).toThrow(
			"getMetricInfo() must be implemented by subclass",
		);
		expect(() => Evaluator.getMetricInfo("any")).toThrow(
			"getMetricInfo() must be implemented by subclass",
		);
	});

	it("stub subclass can evaluate invocations", async () => {
		const evaluator = new StubEvaluator(metric);
		const invocation: Invocation = {
			userContent: { parts: [{ text: "hi" }] },
			creationTimestamp: 1,
		};

		const result = await evaluator.evaluateInvocations(
			[invocation],
			[invocation],
		);

		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults).toEqual([]);
	});
});
