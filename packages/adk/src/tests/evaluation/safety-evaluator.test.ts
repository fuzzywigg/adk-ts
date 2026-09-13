import { describe, expect, it } from "vitest";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { SafetyEvaluatorV1 } from "../../evaluation/safety-evaluator";

describe("SafetyEvaluatorV1", () => {
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
});
