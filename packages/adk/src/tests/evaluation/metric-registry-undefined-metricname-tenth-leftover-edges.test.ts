import { describe, expect, it } from "vitest";
import type { EvalMetric, MetricInfo } from "../../evaluation/eval-metrics";
import {
	type EvaluatorConstructor,
	MetricEvaluatorRegistry,
} from "../../evaluation/metric-evaluator-registry";

class StubEvaluator {
	constructor(public metric: EvalMetric) {}

	static getMetricInfo(): MetricInfo {
		return { metricName: "stub_metric" };
	}

	async evaluateInvocations() {
		return {
			overallScore: 1,
			overallEvalStatus: 1,
			perInvocationResults: [],
		};
	}
}

/**
 * Tenth leftover: registerEvaluator keys the Map with `metricInfo.metricName`
 * as-is — undefined and empty string are valid keys; getEvaluator is
 * case-sensitive.
 */
describe("metric-registry undefined/empty metricName tenth leftover edges", () => {
	it("registers and retrieves under undefined metricName", () => {
		const registry = new MetricEvaluatorRegistry();
		registry.registerEvaluator(
			{ metricName: undefined },
			StubEvaluator as unknown as EvaluatorConstructor,
		);
		const evaluator = registry.getEvaluator({
			metricName: undefined as unknown as string,
			threshold: 1,
		});
		expect(evaluator).toBeInstanceOf(StubEvaluator);
	});

	it("registers and retrieves under empty-string metricName", () => {
		const registry = new MetricEvaluatorRegistry();
		registry.registerEvaluator(
			{ metricName: "" },
			StubEvaluator as unknown as EvaluatorConstructor,
		);
		expect(
			registry.getEvaluator({ metricName: "", threshold: 1 }),
		).toBeInstanceOf(StubEvaluator);
		expect(() =>
			registry.getEvaluator({ metricName: " ", threshold: 1 }),
		).toThrow(/not found/);
	});

	it("getEvaluator is case-sensitive on metricName", () => {
		const registry = new MetricEvaluatorRegistry();
		registry.registerEvaluator(
			{ metricName: "Rouge" },
			StubEvaluator as unknown as EvaluatorConstructor,
		);
		expect(
			registry.getEvaluator({ metricName: "Rouge", threshold: 1 }),
		).toBeInstanceOf(StubEvaluator);
		expect(() =>
			registry.getEvaluator({ metricName: "rouge", threshold: 1 }),
		).toThrow("rouge not found in registry.");
		expect(() =>
			registry.getEvaluator({ metricName: "ROUGE", threshold: 1 }),
		).toThrow("ROUGE not found in registry.");
	});
});
