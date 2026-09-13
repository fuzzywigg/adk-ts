import { describe, expect, it } from "vitest";
import { BaseEvalService } from "../../evaluation/base-eval-service";
import type { Invocation } from "../../evaluation/eval-case";
import type { EvaluateConfig } from "../../evaluation/eval-metrics";
import type { EvalSetResult } from "../../evaluation/eval-result";
import type { EvalSet } from "../../evaluation/eval-set";

class TinyEvalService extends BaseEvalService {
	order: string[] = [];

	async *performInference(_request: {
		evalSetId: string;
		evalCases: EvalSet[];
	}): AsyncGenerator<Invocation[], void> {
		this.order.push("inference");
		yield [
			{
				userContent: { parts: [{ text: "a" }] },
				creationTimestamp: 1,
			},
		];
		yield [
			{
				userContent: { parts: [{ text: "b" }] },
				creationTimestamp: 2,
			},
		];
	}

	async *evaluate(request: {
		inferenceResults: Invocation[][];
		evaluateConfig: EvaluateConfig;
	}): AsyncGenerator<EvalSetResult, void> {
		this.order.push("evaluate");
		expect(request.inferenceResults).toHaveLength(2);
		expect(request.inferenceResults[0][0].userContent.parts?.[0].text).toBe(
			"a",
		);
		expect(request.evaluateConfig.evalMetrics).toEqual([]);
		yield {
			evalSetResultId: "r1",
			evalSetId: "set-1",
			evalCaseResults: [],
			creationTimestamp: 1,
		};
	}
}

describe("BaseEvalService", () => {
	it("drains inference then evaluate in order via evaluateSession", async () => {
		const service = new TinyEvalService();
		const results: EvalSetResult[] = [];

		for await (const result of service.evaluateSession({
			evalSetId: "set-1",
			evalCases: [],
			evaluateConfig: { evalMetrics: [] },
		})) {
			results.push(result);
		}

		expect(service.order).toEqual(["inference", "evaluate"]);
		expect(results).toHaveLength(1);
		expect(results[0].evalSetResultId).toBe("r1");
	});
});
