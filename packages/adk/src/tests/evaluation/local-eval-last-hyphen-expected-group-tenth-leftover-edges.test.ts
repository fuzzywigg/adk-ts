import { afterEach, describe, expect, it, vi } from "vitest";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { LocalEvalService } from "../../evaluation/local-eval-service";
import { DEFAULT_METRIC_EVALUATOR_REGISTRY } from "../../evaluation/metric-evaluator-registry";

/**
 * Tenth leftover: evaluate groups by lastIndexOf("-") on result[0] only —
 * a pair [case-0, case-expected-0] shares evalId "case", then
 * includes("expected") splits actual vs expected inside that bucket.
 */
describe("local-eval lastHyphen expected-group tenth leftover edges", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("lastHyphen uses only inferenceResults[0][0] so case-0 groups the whole pair under case", async () => {
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

		const yielded: string[] = [];
		for await (const r of service.evaluate({
			inferenceResults: [
				[
					{
						invocationId: "case-0",
						userContent: { parts: [{ text: "q" }] },
						creationTimestamp: 1,
					},
					{
						invocationId: "case-expected-0",
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
			yielded.push(r.evalSetId);
		}

		expect(yielded).toEqual(["case"]);
		expect(seen).toEqual([
			{
				actual: ["case-0"],
				expected: ["case-expected-0"],
			},
		]);
	});

	it("hyphen-less invocationId stays as its own evalId", async () => {
		const service = new LocalEvalService({
			name: "stub",
			ask: async () => "unused",
		} as any);

		vi.spyOn(DEFAULT_METRIC_EVALUATOR_REGISTRY, "getEvaluator").mockReturnValue(
			{
				evaluateInvocations: async () => ({
					overallScore: 1,
					overallEvalStatus: EvalStatus.PASSED,
					perInvocationResults: [],
				}),
			} as any,
		);

		const yielded: string[] = [];
		for await (const r of service.evaluate({
			inferenceResults: [
				[
					{
						invocationId: "plain",
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
			yielded.push(r.evalSetId);
		}

		expect(yielded).toEqual(["plain"]);
	});
});
