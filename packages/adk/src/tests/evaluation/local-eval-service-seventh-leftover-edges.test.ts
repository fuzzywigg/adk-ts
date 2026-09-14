import { afterEach, describe, expect, it, vi } from "vitest";
import type { EvalCase } from "../../evaluation/eval-case";
import type { EvalSet } from "../../evaluation/eval-set";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { LocalEvalService } from "../../evaluation/local-eval-service";
import { DEFAULT_METRIC_EVALUATOR_REGISTRY } from "../../evaluation/metric-evaluator-registry";

function makeEvalSet(evalCase: EvalCase): EvalSet {
	return {
		evalSetId: "set-1",
		evalCases: [evalCase],
		creationTimestamp: 1,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("LocalEvalService seventh leftover edges (post #158)", () => {
	it("evaluate throws when an inference batch is an empty array (result[0] crash)", async () => {
		const service = new LocalEvalService({
			name: "stub",
			ask: async () => "unused",
		} as any);

		const gen = service.evaluate({
			inferenceResults: [[]],
			evaluateConfig: {
				evalMetrics: [
					{ metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE, threshold: 0.5 },
				],
			},
		});

		await expect(gen.next()).rejects.toThrow();
	});

	it.each([
		{ id: "unexpected-0", expectedKey: "unexpected" },
		{ id: "case-unexpected-1", expectedKey: "case-unexpected" },
	])("includes('expected') false-positive: $id is classified as expected", async ({
		id,
		expectedKey,
	}) => {
		const evaluateInvocations = vi.fn().mockResolvedValue({
			overallScore: 1,
			overallEvalStatus: EvalStatus.PASSED,
			perInvocationResults: [
				{
					actualInvocation: { invocationId: "x", creationTimestamp: 1 },
					expectedInvocation: { invocationId: id, creationTimestamp: 1 },
					score: 1,
					evalStatus: EvalStatus.PASSED,
				},
			],
		});
		vi.spyOn(DEFAULT_METRIC_EVALUATOR_REGISTRY, "getEvaluator").mockReturnValue(
			{ evaluateInvocations } as any,
		);

		const service = new LocalEvalService({
			name: "stub",
			ask: async () => "unused",
		} as any);

		const results: any[] = [];
		for await (const result of service.evaluate({
			inferenceResults: [[{ invocationId: id, creationTimestamp: 1 } as any]],
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
		expect(results[0].evalSetId).toBe(expectedKey);
		expect(evaluateInvocations).toHaveBeenCalled();
		const [actual, expected] = evaluateInvocations.mock.calls[0];
		expect(actual).toEqual([]);
		expect(expected).toHaveLength(1);
		expect(expected[0].invocationId).toBe(id);
	});

	it("expected vs actual split across separate batches never pairs metrics", async () => {
		const evaluateInvocations = vi.fn().mockResolvedValue({
			overallScore: undefined,
			overallEvalStatus: EvalStatus.NOT_EVALUATED,
			perInvocationResults: [],
		});
		vi.spyOn(DEFAULT_METRIC_EVALUATOR_REGISTRY, "getEvaluator").mockReturnValue(
			{ evaluateInvocations } as any,
		);

		const service = new LocalEvalService({
			name: "stub",
			ask: async () => "unused",
		} as any);

		const results: any[] = [];
		for await (const result of service.evaluate({
			inferenceResults: [
				[{ invocationId: "case-0", creationTimestamp: 1 } as any],
				[{ invocationId: "case-expected-0", creationTimestamp: 1 } as any],
			],
			evaluateConfig: {
				evalMetrics: [
					{ metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE, threshold: 0.5 },
				],
			},
		})) {
			results.push(result);
		}

		expect(results.map((r) => r.evalSetId).sort()).toEqual([
			"case",
			"case-expected",
		]);
		expect(evaluateInvocations).toHaveBeenCalledTimes(2);
		const calls = evaluateInvocations.mock.calls;
		const byEval = new Map(results.map((r) => [r.evalSetId, r] as const));
		void byEval;
		const caseCall = calls.find(
			([actual]) => actual[0]?.invocationId === "case-0",
		);
		const expectedCall = calls.find(
			([, expected]) => expected[0]?.invocationId === "case-expected-0",
		);
		expect(caseCall?.[0]).toHaveLength(1);
		expect(caseCall?.[1]).toHaveLength(0);
		expect(expectedCall?.[0]).toHaveLength(0);
		expect(expectedCall?.[1]).toHaveLength(1);
	});

	it("empty evalMetrics still yields a shell EvalResult with empty evalCaseResults", async () => {
		const service = new LocalEvalService({
			name: "stub",
			ask: async () => "unused",
		} as any);

		const results: any[] = [];
		for await (const result of service.evaluate({
			inferenceResults: [
				[{ invocationId: "shell-0", creationTimestamp: 1 } as any],
			],
			evaluateConfig: { evalMetrics: [] },
		})) {
			results.push(result);
		}

		expect(results).toHaveLength(1);
		expect(results[0].evalSetId).toBe("shell");
		expect(results[0].evalCaseResults).toEqual([]);
		expect(results[0].evalSetResultId).toContain("shell-result-");
	});

	it("performInference still yields for a minimal eval case (smoke)", async () => {
		const service = new LocalEvalService({
			name: "stub",
			ask: async () => "answer",
		} as any);
		await (service as any).initializeRunner();

		const evalCase: EvalCase = {
			evalId: "c1",
			conversation: [
				{
					invocationId: "inv-1",
					userContent: { role: "user", parts: [{ text: "q" }] },
					creationTimestamp: 1,
				},
			],
		};

		const batches: any[] = [];
		for await (const batch of service.performInference({
			evalSetId: "s",
			evalCases: [makeEvalSet(evalCase)],
		})) {
			batches.push(batch);
		}
		expect(batches.length).toBeGreaterThanOrEqual(1);
	});
});
