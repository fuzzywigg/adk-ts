import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { TrajectoryEvaluator } from "../../evaluation/trajectory-evaluator";
import { EvalStatus } from "../../evaluation/evaluator";

function invocation(
	toolUses?: Invocation["intermediateData"],
	overrides: Partial<Invocation> = {},
): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		intermediateData: toolUses,
		...overrides,
	};
}

function tools(
	calls: Array<{ name: string; args?: Record<string, unknown> }>,
): Invocation["intermediateData"] {
	return {
		toolUses: calls,
		intermediateResponses: [],
	};
}

describe("TrajectoryEvaluator leftover edges", () => {
	describe("args || {} normalization", () => {
		it("treats undefined args on actual as empty object and matches expected empty args", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actual = invocation(tools([{ name: "noop" }]));
			const expected = invocation(tools([{ name: "noop", args: {} }]));
			const result = await evaluator.evaluateInvocations([actual], [expected]);
			expect(result.overallScore).toBe(1);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});

		it("treats undefined args on expected as empty object and matches actual empty args", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actual = invocation(tools([{ name: "noop", args: {} }]));
			const expected = invocation(tools([{ name: "noop" }]));
			const result = await evaluator.evaluateInvocations([actual], [expected]);
			expect(result.overallScore).toBe(1);
		});

		it("treats null args on either side as empty object via || {}", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actual = invocation(
				tools([
					{ name: "search", args: null as unknown as Record<string, unknown> },
				]),
			);
			const expected = invocation(tools([{ name: "search" }]));
			const result = await evaluator.evaluateInvocations([actual], [expected]);
			expect(result.overallScore).toBe(1);
		});

		it("fails when actual has args but expected has undefined args treated as {}", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actual = invocation(tools([{ name: "search", args: { q: "x" } }]));
			const expected = invocation(tools([{ name: "search" }]));
			const result = await evaluator.evaluateInvocations([actual], [expected]);
			expect(result.overallScore).toBe(0);
			expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
		});
	});

	describe("missing toolUses on one side", () => {
		it("marks NOT_EVALUATED when actual intermediateData is undefined", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const expected = invocation(tools([{ name: "a" }]));
			const result = await evaluator.evaluateInvocations(
				[invocation(undefined)],
				[expected],
			);
			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
			expect(result.perInvocationResults[0].score).toBeUndefined();
		});

		it("marks NOT_EVALUATED when expected intermediateData is undefined", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actual = invocation(tools([{ name: "a" }]));
			const result = await evaluator.evaluateInvocations(
				[actual],
				[invocation(undefined)],
			);
			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
		});

		it("marks NOT_EVALUATED when actual toolUses is undefined inside intermediateData", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const partial = {
				intermediateResponses: [],
			} as Invocation["intermediateData"];
			const result = await evaluator.evaluateInvocations(
				[invocation(partial)],
				[invocation(tools([{ name: "a" }]))],
			);
			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
		});

		it("marks NOT_EVALUATED when expected toolUses is undefined inside intermediateData", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const partial = {
				intermediateResponses: [],
			} as Invocation["intermediateData"];
			const result = await evaluator.evaluateInvocations(
				[invocation(tools([{ name: "a" }]))],
				[invocation(partial)],
			);
			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
		});
	});

	describe("length mismatch between tool call arrays", () => {
		it("scores zero when actual has more tool uses than expected", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actual = invocation(
				tools([
					{ name: "a", args: {} },
					{ name: "b", args: {} },
				]),
			);
			const expected = invocation(tools([{ name: "a", args: {} }]));
			const result = await evaluator.evaluateInvocations([actual], [expected]);
			expect(result.perInvocationResults[0].score).toBe(0);
		});

		it("scores zero when actual has fewer tool uses than expected", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actual = invocation(tools([{ name: "only" }]));
			const expected = invocation(
				tools([{ name: "first" }, { name: "second" }]),
			);
			const result = await evaluator.evaluateInvocations([actual], [expected]);
			expect(result.perInvocationResults[0].score).toBe(0);
		});

		it("iterates only up to actualInvocations.length without length guard", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const match = tools([{ name: "ok" }]);
			await expect(
				evaluator.evaluateInvocations(
					[invocation(match), invocation(match)],
					[invocation(match)],
				),
			).rejects.toThrow(/intermediateData/);
		});
	});

	describe("key order independence", () => {
		it("matches when arg keys are reversed between actual and expected", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actual = invocation(
				tools([{ name: "fn", args: { z: 3, y: 2, x: 1 } }]),
			);
			const expected = invocation(
				tools([{ name: "fn", args: { x: 1, y: 2, z: 3 } }]),
			);
			const result = await evaluator.evaluateInvocations([actual], [expected]);
			expect(result.overallScore).toBe(1);
		});

		it("fails when sorted keys match count but values differ", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actual = invocation(tools([{ name: "fn", args: { a: 1, b: 2 } }]));
			const expected = invocation(
				tools([{ name: "fn", args: { b: 9, a: 1 } }]),
			);
			const result = await evaluator.evaluateInvocations([actual], [expected]);
			expect(result.overallScore).toBe(0);
		});
	});

	describe("empty toolUses arrays", () => {
		it("scores perfect match for both-empty toolUses", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const empty = tools([]);
			const result = await evaluator.evaluateInvocations(
				[invocation(empty)],
				[invocation(empty)],
			);
			expect(result.perInvocationResults[0].score).toBe(1);
			expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		});

		it("scores zero when one side is empty and the other is not", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const result = await evaluator.evaluateInvocations(
				[invocation(tools([]))],
				[invocation(tools([{ name: "x" }]))],
			);
			expect(result.perInvocationResults[0].score).toBe(0);
		});
	});

	describe("name mismatch", () => {
		it("scores zero when tool names differ at the same index", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actual = invocation(tools([{ name: "search", args: { q: "x" } }]));
			const expected = invocation(
				tools([{ name: "lookup", args: { q: "x" } }]),
			);
			const result = await evaluator.evaluateInvocations([actual], [expected]);
			expect(result.overallScore).toBe(0);
			expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
		});

		it("scores zero when names differ case-sensitively", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actual = invocation(tools([{ name: "Search" }]));
			const expected = invocation(tools([{ name: "search" }]));
			const result = await evaluator.evaluateInvocations([actual], [expected]);
			expect(result.overallScore).toBe(0);
		});
	});

	describe("nested JSON equal args", () => {
		it("matches deeply nested objects via JSON.stringify", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const payload = {
				meta: { tags: ["a", "b"], nested: { n: null, f: 1.5 } },
				list: [{ id: 1 }, { id: 2 }],
			};
			const actual = invocation(tools([{ name: "write", args: { payload } }]));
			const expected = invocation(
				tools([{ name: "write", args: { payload } }]),
			);
			const result = await evaluator.evaluateInvocations([actual], [expected]);
			expect(result.overallScore).toBe(1);
		});

		it("fails when nested array element differs", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actual = invocation(
				tools([{ name: "write", args: { items: [1, 2, 3] } }]),
			);
			const expected = invocation(
				tools([{ name: "write", args: { items: [1, 2, 4] } }]),
			);
			const result = await evaluator.evaluateInvocations([actual], [expected]);
			expect(result.overallScore).toBe(0);
		});

		it("distinguishes number from string in nested values", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actual = invocation(tools([{ name: "set", args: { n: 1 } }]));
			const expected = invocation(tools([{ name: "set", args: { n: "1" } }]));
			const result = await evaluator.evaluateInvocations([actual], [expected]);
			expect(result.overallScore).toBe(0);
		});
	});

	describe("overallScore when all NOT_EVALUATED", () => {
		it("returns overallScore 0 and FAILED when every row is NOT_EVALUATED", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 0.5,
			});
			const result = await evaluator.evaluateInvocations(
				[invocation(undefined), invocation(undefined)],
				[invocation(undefined), invocation(undefined)],
			);
			expect(
				result.perInvocationResults.every(
					(r) => r.evalStatus === EvalStatus.NOT_EVALUATED,
				),
			).toBe(true);
			expect(result.overallScore).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("returns FAILED even with threshold 0 when numInvocations is 0", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 0,
			});
			const result = await evaluator.evaluateInvocations(
				[invocation(undefined)],
				[invocation(undefined)],
			);
			expect(result.overallScore).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});
	});

	describe("threshold boundary PASSED/FAILED", () => {
		it("passes when overallScore equals threshold exactly at 0.5", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 0.5,
			});
			const match = tools([{ name: "ok" }]);
			const miss = tools([{ name: "bad" }]);
			const result = await evaluator.evaluateInvocations(
				[invocation(match), invocation(miss)],
				[invocation(match), invocation(tools([{ name: "ok" }]))],
			);
			expect(result.overallScore).toBe(0.5);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});

		it("fails when overallScore is just below threshold", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 0.51,
			});
			const match = tools([{ name: "ok" }]);
			const miss = tools([{ name: "bad" }]);
			const result = await evaluator.evaluateInvocations(
				[invocation(match), invocation(miss)],
				[invocation(match), invocation(tools([{ name: "ok" }]))],
			);
			expect(result.overallScore).toBe(0.5);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		});

		it("marks per-invocation PASSED when score equals threshold", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 0,
			});
			const miss = tools([{ name: "bad" }]);
			const result = await evaluator.evaluateInvocations(
				[invocation(miss)],
				[invocation(tools([{ name: "good" }]))],
			);
			expect(result.perInvocationResults[0].score).toBe(0);
			expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		});
	});

	describe("mixed evaluated and not-evaluated averaging", () => {
		it("averages only evaluated invocations when first row is NOT_EVALUATED", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 0.5,
			});
			const match = tools([{ name: "ok" }]);
			const result = await evaluator.evaluateInvocations(
				[invocation(undefined), invocation(match)],
				[invocation(undefined), invocation(match)],
			);
			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
			expect(result.perInvocationResults[1].score).toBe(1);
			expect(result.overallScore).toBe(1);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});

		it("averages only evaluated when middle row is NOT_EVALUATED", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 0.5,
			});
			const match = tools([{ name: "ok" }]);
			const miss = tools([{ name: "bad" }]);
			const result = await evaluator.evaluateInvocations(
				[invocation(match), invocation(undefined), invocation(miss)],
				[invocation(match), invocation(undefined), invocation(match)],
			);
			expect(result.overallScore).toBe(0.5);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});

		it("computes 0.5 average from one pass and one fail excluding NOT_EVALUATED", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 0.5,
			});
			const match = tools([{ name: "ok" }]);
			const miss = tools([{ name: "bad" }]);
			const result = await evaluator.evaluateInvocations(
				[invocation(match), invocation(undefined), invocation(miss)],
				[invocation(match), invocation(undefined), invocation(match)],
			);
			expect(result.overallScore).toBe(0.5);
		});
	});

	describe("invocation reference preservation", () => {
		it("preserves actual and expected invocation objects on each row", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actual = invocation(tools([{ name: "a" }]));
			const expected = invocation(tools([{ name: "a" }]));
			const result = await evaluator.evaluateInvocations([actual], [expected]);
			expect(result.perInvocationResults[0].actualInvocation).toBe(actual);
			expect(result.perInvocationResults[0].expectedInvocation).toBe(expected);
		});
	});

	describe("multi-tool sequence equality", () => {
		it("requires exact order match for multiple tool calls", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actual = invocation(
				tools([
					{ name: "first", args: {} },
					{ name: "second", args: {} },
				]),
			);
			const expected = invocation(
				tools([
					{ name: "second", args: {} },
					{ name: "first", args: {} },
				]),
			);
			const result = await evaluator.evaluateInvocations([actual], [expected]);
			expect(result.overallScore).toBe(0);
		});

		it("matches multi-tool sequence when order and args align", async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const seq = tools([
				{ name: "search", args: { q: "a" } },
				{ name: "fetch", args: { id: 1 } },
				{ name: "summarize", args: {} },
			]);
			const result = await evaluator.evaluateInvocations(
				[invocation(seq)],
				[invocation(seq)],
			);
			expect(result.overallScore).toBe(1);
		});
	});
});
