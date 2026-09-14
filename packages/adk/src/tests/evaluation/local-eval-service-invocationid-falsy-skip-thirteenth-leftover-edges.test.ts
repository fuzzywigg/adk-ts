import { afterEach, describe, expect, it, vi } from "vitest";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { LocalEvalService } from "../../evaluation/local-eval-service";
import { DEFAULT_METRIC_EVALUATOR_REGISTRY } from "../../evaluation/metric-evaluator-registry";

/**
 * Thirteenth leftover: evaluate `if (!invocationId) continue` — 0/""/false skip
 * the batch; "0"/whitespace are kept as Map keys.
 */
describe("local-eval-service invocationId falsy skip thirteenth leftover", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function service() {
		return new LocalEvalService({
			name: "stub",
			ask: async () => "unused",
		} as any);
	}

	it.each([
		{ label: "empty string", invocationId: "" },
		{ label: "undefined", invocationId: undefined },
		{ label: "null", invocationId: null },
		{ label: "0", invocationId: 0 },
		{ label: "false", invocationId: false },
	])("skips batch when invocationId is $label", async ({ invocationId }) => {
		const evaluateInvocations = vi.fn();
		vi.spyOn(DEFAULT_METRIC_EVALUATOR_REGISTRY, "getEvaluator").mockReturnValue(
			{ evaluateInvocations } as any,
		);
		const results: unknown[] = [];
		for await (const result of service().evaluate({
			inferenceResults: [[{ invocationId, creationTimestamp: 1 } as any]],
			evaluateConfig: {
				evalMetrics: [
					{ metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE, threshold: 0.5 },
				],
			},
		})) {
			results.push(result);
		}
		expect(results).toEqual([]);
		expect(evaluateInvocations).not.toHaveBeenCalled();
	});

	it.each([
		"0",
		" ",
		"false",
	])("keeps truthy invocationId %j as a case key", async (invocationId) => {
		const evaluateInvocations = vi.fn().mockResolvedValue({
			overallScore: 1,
			overallEvalStatus: EvalStatus.PASSED,
			perInvocationResults: [],
		});
		vi.spyOn(DEFAULT_METRIC_EVALUATOR_REGISTRY, "getEvaluator").mockReturnValue(
			{ evaluateInvocations } as any,
		);

		const results: any[] = [];
		for await (const result of service().evaluate({
			inferenceResults: [[{ invocationId, creationTimestamp: 1 } as any]],
			evaluateConfig: {
				evalMetrics: [
					{
						metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
						threshold: 0.5,
					},
				],
			},
		})) {
			results.push(result);
		}
		expect(results).toHaveLength(1);
		expect(results[0].evalSetId).toBe(invocationId);
		expect(evaluateInvocations).toHaveBeenCalled();
	});
});
