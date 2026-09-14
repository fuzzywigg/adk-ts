import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import {
	ALLOWED_CRITERIA,
	MISSING_EVAL_DEPENDENCIES_MESSAGE,
	QUERY_COLUMN,
	REFERENCE_COLUMN,
	EXPECTED_TOOL_USE_COLUMN,
	RESPONSE_EVALUATION_SCORE_THRESHOLD,
	SAFETY_SCORE_THRESHOLD,
} from "../../evaluation/constants";
import { EvalStatus } from "../../evaluation/evaluator";
import { TrajectoryEvaluator } from "../../evaluation/trajectory-evaluator";

function invocation(toolUses?: Invocation["intermediateData"]): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		intermediateData: toolUses,
	};
}

describe("TrajectoryEvaluator heavy matrix leftover edges", () => {
	const evaluator = new TrajectoryEvaluator({
		metricName: "tool_trajectory_avg_score",
		threshold: 1,
	});

	it("exposes closed [0,1] metric info", () => {
		const info = TrajectoryEvaluator.getMetricInfo();
		expect(info.metricName).toBe("tool_trajectory_avg_score");
		expect(info.metricValueInfo.interval).toEqual({
			minValue: 0,
			maxValue: 1,
			openAtMin: false,
			openAtMax: false,
		});
		expect(info.description).toMatch(/exact match/i);
	});

	it("scores empty tool use arrays as a perfect match", async () => {
		const empty = {
			toolUses: [],
			intermediateResponses: [],
		};
		const result = await evaluator.evaluateInvocations(
			[invocation(empty)],
			[invocation(empty)],
		);
		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("requires both sides to have toolUses arrays to evaluate", async () => {
		const withTools = invocation({
			toolUses: [{ name: "search", args: { q: "x" } }],
			intermediateResponses: [],
		});
		const without = invocation(undefined);
		const result = await evaluator.evaluateInvocations([withTools], [without]);
		expect(result.perInvocationResults[0].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
	});

	it("fails when tool names differ", async () => {
		const result = await evaluator.evaluateInvocations(
			[
				invocation({
					toolUses: [{ name: "a", args: {} }],
					intermediateResponses: [],
				}),
			],
			[
				invocation({
					toolUses: [{ name: "b", args: {} }],
					intermediateResponses: [],
				}),
			],
		);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("fails when arg values differ for the same tool name", async () => {
		const result = await evaluator.evaluateInvocations(
			[
				invocation({
					toolUses: [{ name: "search", args: { q: "a" } }],
					intermediateResponses: [],
				}),
			],
			[
				invocation({
					toolUses: [{ name: "search", args: { q: "b" } }],
					intermediateResponses: [],
				}),
			],
		);
		expect(result.perInvocationResults[0].score).toBe(0);
	});

	it("fails when arg key sets differ", async () => {
		const result = await evaluator.evaluateInvocations(
			[
				invocation({
					toolUses: [{ name: "search", args: { q: "a" } }],
					intermediateResponses: [],
				}),
			],
			[
				invocation({
					toolUses: [{ name: "search", args: { q: "a", limit: 1 } }],
					intermediateResponses: [],
				}),
			],
		);
		expect(result.overallScore).toBe(0);
	});

	it("compares multi-step trajectories in order", async () => {
		const traj = {
			toolUses: [
				{ name: "search", args: { q: "1" } },
				{ name: "fetch", args: { url: "https://x" } },
			],
			intermediateResponses: [],
		};
		const pass = await evaluator.evaluateInvocations(
			[invocation(traj)],
			[invocation(traj)],
		);
		expect(pass.overallScore).toBe(1);

		const swapped = {
			toolUses: [
				{ name: "fetch", args: { url: "https://x" } },
				{ name: "search", args: { q: "1" } },
			],
			intermediateResponses: [],
		};
		const fail = await evaluator.evaluateInvocations(
			[invocation(swapped)],
			[invocation(traj)],
		);
		expect(fail.overallScore).toBe(0);
	});

	it("averages only evaluated invocations in overallScore", async () => {
		const tools = {
			toolUses: [{ name: "t", args: {} }],
			intermediateResponses: [],
		};
		const result = await evaluator.evaluateInvocations(
			[invocation(tools), invocation(undefined), invocation(tools)],
			[invocation(tools), invocation(undefined), invocation(tools)],
		);
		expect(result.perInvocationResults[1].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("overall fails when any evaluated invocation fails", async () => {
		const good = {
			toolUses: [{ name: "t", args: { a: 1 } }],
			intermediateResponses: [],
		};
		const badActual = {
			toolUses: [{ name: "t", args: { a: 2 } }],
			intermediateResponses: [],
		};
		const result = await evaluator.evaluateInvocations(
			[invocation(good), invocation(badActual)],
			[invocation(good), invocation(good)],
		);
		expect(result.overallScore).toBe(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("nested object args must deeply match", async () => {
		const actual = invocation({
			toolUses: [{ name: "cfg", args: { nested: { x: 1 } } }],
			intermediateResponses: [],
		});
		const expected = invocation({
			toolUses: [{ name: "cfg", args: { nested: { x: 1 } } }],
			intermediateResponses: [],
		});
		const pass = await evaluator.evaluateInvocations([actual], [expected]);
		expect(pass.overallScore).toBe(1);

		const mismatch = invocation({
			toolUses: [{ name: "cfg", args: { nested: { x: 2 } } }],
			intermediateResponses: [],
		});
		const fail = await evaluator.evaluateInvocations([mismatch], [expected]);
		expect(fail.overallScore).toBe(0);
	});

	it("length mismatch in toolUses fails", async () => {
		const result = await evaluator.evaluateInvocations(
			[
				invocation({
					toolUses: [
						{ name: "a", args: {} },
						{ name: "b", args: {} },
					],
					intermediateResponses: [],
				}),
			],
			[
				invocation({
					toolUses: [{ name: "a", args: {} }],
					intermediateResponses: [],
				}),
			],
		);
		expect(result.overallScore).toBe(0);
	});

	it("empty invocation batches yield score 0", async () => {
		const result = await evaluator.evaluateInvocations([], []);
		expect(result.overallScore).toBe(0);
		expect(result.perInvocationResults).toEqual([]);
	});

	it("threshold below 1 still passes perfect matches", async () => {
		const loose = new TrajectoryEvaluator({
			metricName: "tool_trajectory_avg_score",
			threshold: 0.5,
		});
		const tools = {
			toolUses: [{ name: "t", args: {} }],
			intermediateResponses: [],
		};
		const result = await loose.evaluateInvocations(
			[invocation(tools)],
			[invocation(tools)],
		);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});
});

describe("evaluation constants heavy matrix leftover edges", () => {
	it("documents column and threshold constants", () => {
		expect(QUERY_COLUMN).toBe("query");
		expect(REFERENCE_COLUMN).toBe("reference");
		expect(EXPECTED_TOOL_USE_COLUMN).toBe("expected_tool_use");
		expect(SAFETY_SCORE_THRESHOLD).toBe(1.0);
		expect(RESPONSE_EVALUATION_SCORE_THRESHOLD).toBe(1.0);
		expect(MISSING_EVAL_DEPENDENCIES_MESSAGE).toMatch(/pandas/);
		expect(ALLOWED_CRITERIA).toEqual([
			"tool_trajectory_score",
			"response_evaluation_score",
			"response_match_score",
			"safety_v1",
		]);
	});
});
