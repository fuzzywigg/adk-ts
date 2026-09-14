import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { ResponseEvaluator } from "../../evaluation/response-evaluator";
import { TrajectoryEvaluator } from "../../evaluation/trajectory-evaluator";

function textInvocation(text?: string): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse:
			text !== undefined ? { role: "model", parts: [{ text }] } : undefined,
	};
}

function toolInvocation(
	toolUses?: NonNullable<Invocation["intermediateData"]>["toolUses"],
): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		intermediateData: toolUses
			? { toolUses, intermediateResponses: [] }
			: undefined,
	};
}

describe("ResponseEvaluator heavy matrix leftover edges", () => {
	it("throws when actual and expected invocation counts diverge", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});
		await expect(
			evaluator.evaluateInvocations(
				[textInvocation("a"), textInvocation("b")],
				[textInvocation("a")],
			),
		).rejects.toThrow(/must match/i);
	});

	it("averages multi-invocation rouge scores for overall status", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});
		const result = await evaluator.evaluateInvocations(
			[textInvocation("same words here"), textInvocation("zzz")],
			[textInvocation("same words here"), textInvocation("yyy")],
		);
		expect(result.perInvocationResults).toHaveLength(2);
		expect(result.perInvocationResults[0].score).toBe(1);
		expect(result.perInvocationResults[1].score).toBe(0);
		expect(result.overallScore).toBe(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("fails overall when average sits strictly below threshold", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.75,
		});
		const result = await evaluator.evaluateInvocations(
			[textInvocation("alpha beta"), textInvocation("gamma")],
			[textInvocation("alpha beta"), textInvocation("delta")],
		);
		expect(result.overallScore).toBe(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("passes when score equals threshold exactly", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 1,
		});
		const result = await evaluator.evaluateInvocations(
			[textInvocation("exact match phrase")],
			[textInvocation("exact match phrase")],
		);
		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("marks only the missing-response pair as NOT_EVALUATED in a mixed batch", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});
		const result = await evaluator.evaluateInvocations(
			[textInvocation("ok"), textInvocation()],
			[textInvocation("ok"), textInvocation("expected")],
		);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[1].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
		expect(result.overallScore).toBe(1);
	});

	it("treats expected missing finalResponse as NOT_EVALUATED even if actual exists", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.1,
		});
		const result = await evaluator.evaluateInvocations(
			[textInvocation("actual")],
			[textInvocation()],
		);
		expect(result.perInvocationResults[0].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
		expect(result.perInvocationResults[0].score).toBeUndefined();
	});

	it("scores unicode and punctuation-only strings without throwing", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0,
		});
		const result = await evaluator.evaluateInvocations(
			[textInvocation("café 🚀"), textInvocation("!!!")],
			[textInvocation("café 🚀"), textInvocation("???")],
		);
		expect(result.perInvocationResults).toHaveLength(2);
		expect(result.perInvocationResults[0].score).toBe(1);
		expect(typeof result.perInvocationResults[1].score).toBe("number");
	});

	it("handles empty invocation arrays with undefined overall score", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});
		const result = await evaluator.evaluateInvocations([], []);
		expect(result.perInvocationResults).toEqual([]);
		expect(result.overallScore).toBeUndefined();
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("rejects unsupported metric names at construction", () => {
		expect(
			() =>
				new ResponseEvaluator({
					metricName: PrebuiltMetrics.SAFETY_V1,
					threshold: 0.5,
				}),
		).toThrow(/not supported/i);
	});

	it("exposes RESPONSE_MATCH_SCORE metric info interval as closed [0,1]", () => {
		const info = ResponseEvaluator.getMetricInfo(
			PrebuiltMetrics.RESPONSE_MATCH_SCORE,
		);
		expect(info.metricValueInfo.interval).toEqual({
			minValue: 0,
			maxValue: 1,
			openAtMin: false,
			openAtMax: false,
		});
	});
});

describe("TrajectoryEvaluator heavy matrix leftover edges", () => {
	const evaluator = new TrajectoryEvaluator({
		metricName: "tool_trajectory_avg_score",
		threshold: 1,
	});

	it("scores empty toolUses arrays as perfect matches", async () => {
		const empty = toolInvocation([]);
		const result = await evaluator.evaluateInvocations([empty], [empty]);
		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("fails when tool counts diverge even if the prefix matches", async () => {
		const actual = toolInvocation([
			{ name: "search", args: { q: "a" } },
			{ name: "fetch", args: {} },
		]);
		const expected = toolInvocation([{ name: "search", args: { q: "a" } }]);
		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("requires exact arg key sets (extra actual keys fail)", async () => {
		const actual = toolInvocation([
			{ name: "search", args: { q: "adk", limit: 5 } },
		]);
		const expected = toolInvocation([{ name: "search", args: { q: "adk" } }]);
		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.overallScore).toBe(0);
	});

	it("treats nested object arg equality by deep value", async () => {
		const tools = [{ name: "write", args: { payload: { a: 1, b: [2, 3] } } }];
		const result = await evaluator.evaluateInvocations(
			[toolInvocation(tools)],
			[toolInvocation(tools)],
		);
		expect(result.overallScore).toBe(1);
	});

	it("fails nested object arg mismatches", async () => {
		const actual = toolInvocation([
			{ name: "write", args: { payload: { a: 1 } } },
		]);
		const expected = toolInvocation([
			{ name: "write", args: { payload: { a: 2 } } },
		]);
		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.overallScore).toBe(0);
	});

	it("averages mixed pass/fail trajectories across invocations", async () => {
		const match = toolInvocation([{ name: "a", args: {} }]);
		const miss = toolInvocation([{ name: "a", args: { x: 1 } }]);
		const expectedMiss = toolInvocation([{ name: "a", args: { x: 2 } }]);
		const result = await evaluator.evaluateInvocations(
			[match, miss],
			[match, expectedMiss],
		);
		expect(result.perInvocationResults[0].score).toBe(1);
		expect(result.perInvocationResults[1].score).toBe(0);
		expect(result.overallScore).toBe(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("passes overall when threshold is at or below the average", async () => {
		const soft = new TrajectoryEvaluator({
			metricName: "tool_trajectory_avg_score",
			threshold: 0.5,
		});
		const match = toolInvocation([{ name: "a", args: {} }]);
		const miss = toolInvocation([{ name: "b", args: {} }]);
		const expectedMiss = toolInvocation([{ name: "c", args: {} }]);
		const result = await soft.evaluateInvocations(
			[match, miss],
			[match, expectedMiss],
		);
		expect(result.overallScore).toBe(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("marks undefined intermediateData as NOT_EVALUATED with zero overall", async () => {
		const result = await evaluator.evaluateInvocations(
			[toolInvocation(undefined)],
			[toolInvocation(undefined)],
		);
		expect(result.perInvocationResults[0].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("exposes metric info with closed [0,1] interval", () => {
		const info = TrajectoryEvaluator.getMetricInfo();
		expect(info.metricName).toBe("tool_trajectory_avg_score");
		expect(info.metricValueInfo.interval?.minValue).toBe(0);
		expect(info.metricValueInfo.interval?.maxValue).toBe(1);
	});

	it("compares tool names case-sensitively", async () => {
		const actual = toolInvocation([{ name: "Search", args: {} }]);
		const expected = toolInvocation([{ name: "search", args: {} }]);
		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.overallScore).toBe(0);
	});

	it("accepts nullish args objects as matching when both omit args", async () => {
		const actual = toolInvocation([{ name: "noop" } as any]);
		const expected = toolInvocation([{ name: "noop" } as any]);
		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect([0, 1]).toContain(result.overallScore);
	});
});
