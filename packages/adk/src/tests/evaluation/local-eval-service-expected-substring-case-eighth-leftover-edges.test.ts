import { afterEach, describe, expect, it, vi } from "vitest";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { LocalEvalService } from "../../evaluation/local-eval-service";
import { DEFAULT_METRIC_EVALUATOR_REGISTRY } from "../../evaluation/metric-evaluator-registry";

/**
 * Leftover: evaluate splits actual/expected via includes("expected") —
 * Expected/EXPECTED stay in the actual bucket (case-sensitive).
 */
describe("local-eval-service expected substring case eighth leftover edges", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		{ id: "case-Expected", label: "Expected" },
		{ id: "case-EXPECTED", label: "EXPECTED" },
	] as const)("invocationId with $label stays in actual (not expected)", async ({
		id,
	}) => {
		const service = new LocalEvalService({
			name: "stub",
			ask: async () => "unused",
		} as any);

		const seen: { actual: string[]; expected: string[] }[] = [];
		vi.spyOn(DEFAULT_METRIC_EVALUATOR_REGISTRY, "getEvaluator").mockReturnValue(
			{
				evaluateInvocations: async (actual: any[], expected: any[]) => {
					seen.push({
						actual: actual.map((a) => a.invocationId),
						expected: expected.map((e) => e.invocationId),
					});
					return {
						overallScore: 1,
						overallEvalStatus: EvalStatus.PASSED,
						perInvocationResults: [],
					};
				},
			} as any,
		);

		const results = [];
		for await (const r of service.evaluate({
			inferenceResults: [
				[
					{
						invocationId: id,
						userContent: { parts: [{ text: "q" }] },
						creationTimestamp: 1,
					},
					{
						invocationId: "case-expected",
						userContent: { parts: [{ text: "q" }] },
						creationTimestamp: 1,
					},
				],
			],
			evaluateConfig: {
				evalMetrics: [
					{
						metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
						threshold: 0,
					},
				],
			},
		})) {
			results.push(r);
		}

		expect(results).toHaveLength(1);
		expect(seen[0].actual).toContain(id);
		expect(seen[0].actual).not.toContain("case-expected");
		expect(seen[0].expected).toEqual(["case-expected"]);
	});

	it("lowercase expected still splits (control)", async () => {
		const service = new LocalEvalService({
			name: "stub",
			ask: async () => "unused",
		} as any);

		const seen: { actual: string[]; expected: string[] }[] = [];
		vi.spyOn(DEFAULT_METRIC_EVALUATOR_REGISTRY, "getEvaluator").mockReturnValue(
			{
				evaluateInvocations: async (actual: any[], expected: any[]) => {
					seen.push({
						actual: actual.map((a) => a.invocationId),
						expected: expected.map((e) => e.invocationId),
					});
					return {
						overallScore: 1,
						overallEvalStatus: EvalStatus.PASSED,
						perInvocationResults: [],
					};
				},
			} as any,
		);

		for await (const _ of service.evaluate({
			inferenceResults: [
				[
					{
						invocationId: "case-0",
						userContent: { parts: [{ text: "q" }] },
						creationTimestamp: 1,
					},
					{
						invocationId: "case-expected",
						userContent: { parts: [{ text: "q" }] },
						creationTimestamp: 1,
					},
				],
			],
			evaluateConfig: {
				evalMetrics: [
					{
						metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
						threshold: 0,
					},
				],
			},
		})) {
			/* drain */
		}

		expect(seen[0]).toEqual({
			actual: ["case-0"],
			expected: ["case-expected"],
		});
	});
});
