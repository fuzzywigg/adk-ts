import { describe, expect, it } from "vitest";
import { BaseEvalService } from "../../evaluation/base-eval-service";
import type { Invocation } from "../../evaluation/eval-case";
import type { EvaluateConfig } from "../../evaluation/eval-metrics";
import type { EvalSetResult } from "../../evaluation/eval-result";
import type { EvalSet } from "../../evaluation/eval-set";

class RecordingEvalService extends BaseEvalService {
	inferenceCalls = 0;
	evaluateCalls = 0;
	lastInferenceRequest: { evalSetId: string; evalCases: EvalSet[] } | null =
		null;
	lastEvaluateRequest: {
		inferenceResults: Invocation[][];
		evaluateConfig: EvaluateConfig;
	} | null = null;

	constructor(
		private readonly inferenceBatches: Invocation[][],
		private readonly evaluateYields: EvalSetResult[],
		private readonly failAt?: "inference" | "evaluate",
	) {
		super();
	}

	async *performInference(request: {
		evalSetId: string;
		evalCases: EvalSet[];
	}): AsyncGenerator<Invocation[], void> {
		this.inferenceCalls += 1;
		this.lastInferenceRequest = request;
		if (this.failAt === "inference") {
			throw new Error("inference-boom");
		}
		for (const batch of this.inferenceBatches) {
			yield batch;
		}
	}

	async *evaluate(request: {
		inferenceResults: Invocation[][];
		evaluateConfig: EvaluateConfig;
	}): AsyncGenerator<EvalSetResult, void> {
		this.evaluateCalls += 1;
		this.lastEvaluateRequest = request;
		if (this.failAt === "evaluate") {
			throw new Error("evaluate-boom");
		}
		for (const result of this.evaluateYields) {
			yield result;
		}
	}
}

function inv(text: string, ts = 1): Invocation {
	return {
		userContent: { parts: [{ text }] },
		creationTimestamp: ts,
	};
}

describe("BaseEvalService deepen edges (TOKENMAXX remainder)", () => {
	it("evaluateSession with empty inference still invokes evaluate with []", async () => {
		const service = new RecordingEvalService(
			[],
			[
				{
					evalSetResultId: "empty-r",
					evalSetId: "set-empty",
					evalCaseResults: [],
					creationTimestamp: 1,
				},
			],
		);

		const results: EvalSetResult[] = [];
		for await (const result of service.evaluateSession({
			evalSetId: "set-empty",
			evalCases: [],
			evaluateConfig: { evalMetrics: [] },
		})) {
			results.push(result);
		}

		expect(service.inferenceCalls).toBe(1);
		expect(service.evaluateCalls).toBe(1);
		expect(service.lastEvaluateRequest?.inferenceResults).toEqual([]);
		expect(results).toHaveLength(1);
		expect(results[0].evalSetResultId).toBe("empty-r");
	});

	it("forwards evalSetId and evalCases into performInference", async () => {
		const cases: EvalSet[] = [
			{ evalSetId: "inner", evalCases: [], creationTimestamp: 9 },
		];
		const service = new RecordingEvalService([], []);

		for await (const _ of service.evaluateSession({
			evalSetId: "outer-set",
			evalCases: cases,
			evaluateConfig: { evalMetrics: [{ metricName: "m", threshold: 1 }] },
		})) {
			// drain
		}

		expect(service.lastInferenceRequest).toEqual({
			evalSetId: "outer-set",
			evalCases: cases,
		});
		expect(service.lastEvaluateRequest?.evaluateConfig.evalMetrics).toEqual([
			{ metricName: "m", threshold: 1 },
		]);
	});

	it("accumulates multiple inference batches before evaluate", async () => {
		const service = new RecordingEvalService(
			[[inv("a", 1)], [inv("b", 2), inv("c", 3)]],
			[
				{
					evalSetResultId: "r-multi",
					evalSetId: "set-1",
					evalCaseResults: [],
					creationTimestamp: 2,
				},
			],
		);

		const results: EvalSetResult[] = [];
		for await (const result of service.evaluateSession({
			evalSetId: "set-1",
			evalCases: [],
			evaluateConfig: { evalMetrics: [] },
		})) {
			results.push(result);
		}

		expect(service.lastEvaluateRequest?.inferenceResults).toEqual([
			[inv("a", 1)],
			[inv("b", 2), inv("c", 3)],
		]);
		expect(results.map((r) => r.evalSetResultId)).toEqual(["r-multi"]);
	});

	it("yields every evaluate result in order", async () => {
		const service = new RecordingEvalService(
			[[inv("x")]],
			[
				{
					evalSetResultId: "r1",
					evalSetId: "s",
					evalCaseResults: [],
					creationTimestamp: 1,
				},
				{
					evalSetResultId: "r2",
					evalSetId: "s",
					evalCaseResults: [],
					creationTimestamp: 2,
				},
				{
					evalSetResultId: "r3",
					evalSetId: "s",
					evalCaseResults: [],
					creationTimestamp: 3,
				},
			],
		);

		const ids: string[] = [];
		for await (const result of service.evaluateSession({
			evalSetId: "s",
			evalCases: [],
			evaluateConfig: { evalMetrics: [] },
		})) {
			ids.push(result.evalSetResultId);
		}

		expect(ids).toEqual(["r1", "r2", "r3"]);
		expect(service.evaluateCalls).toBe(1);
	});

	it("propagates inference errors before evaluate runs", async () => {
		const service = new RecordingEvalService([], [], "inference");

		await expect(async () => {
			for await (const _ of service.evaluateSession({
				evalSetId: "s",
				evalCases: [],
				evaluateConfig: { evalMetrics: [] },
			})) {
				// drain
			}
		}).rejects.toThrow("inference-boom");

		expect(service.evaluateCalls).toBe(0);
	});

	it("propagates evaluate errors after inference completes", async () => {
		const service = new RecordingEvalService([[inv("ok")]], [], "evaluate");

		await expect(async () => {
			for await (const _ of service.evaluateSession({
				evalSetId: "s",
				evalCases: [],
				evaluateConfig: { evalMetrics: [] },
			})) {
				// drain
			}
		}).rejects.toThrow("evaluate-boom");

		expect(service.inferenceCalls).toBe(1);
		expect(service.evaluateCalls).toBe(1);
		expect(service.lastEvaluateRequest?.inferenceResults).toEqual([
			[inv("ok")],
		]);
	});

	it("does not call evaluate when inference throws mid-stream", async () => {
		class MidStreamFail extends BaseEvalService {
			evaluateCalls = 0;

			async *performInference(): AsyncGenerator<Invocation[], void> {
				yield [inv("first")];
				throw new Error("mid-inference");
			}

			async *evaluate(): AsyncGenerator<EvalSetResult, void> {
				this.evaluateCalls += 1;
				if (this.evaluateCalls < 0) {
					yield {
						evalSetResultId: "unreachable",
						evalSetId: "s",
						evalCaseResults: [],
						creationTimestamp: 0,
					};
				}
			}
		}

		const service = new MidStreamFail();
		await expect(async () => {
			for await (const _ of service.evaluateSession({
				evalSetId: "s",
				evalCases: [],
				evaluateConfig: { evalMetrics: [] },
			})) {
				// drain
			}
		}).rejects.toThrow("mid-inference");
		expect(service.evaluateCalls).toBe(0);
	});
});
