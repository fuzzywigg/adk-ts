import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { EvalStatus } from "../../evaluation/evaluator";
import { TrajectoryEvaluator } from "../../evaluation/trajectory-evaluator";

function invocation(
	toolUses?: Invocation["intermediateData"],
	overrides: Partial<Invocation> = {},
): Invocation {
	return {
		userContent: { parts: [{ text: "q" }] },
		creationTimestamp: 1,
		intermediateData: toolUses,
		...overrides,
	};
}

function tools(
	calls: Array<{ name?: string; args?: Record<string, unknown> | null }>,
): Invocation["intermediateData"] {
	return {
		toolUses: calls as any,
		intermediateResponses: [],
	};
}

describe("TrajectoryEvaluator fourth leftover edges", () => {
	const thresholds = [
		{ threshold: 0, status: EvalStatus.PASSED },
		{ threshold: 0.5, status: EvalStatus.FAILED },
		{ threshold: 1, status: EvalStatus.FAILED },
	];

	for (const { threshold, status } of thresholds) {
		it(`empty invocation lists score 0 vs threshold ${threshold}`, async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold,
			});
			const result = await evaluator.evaluateInvocations([], []);
			expect(result.overallScore).toBe(0);
			expect(result.overallEvalStatus).toBe(status);
			expect(result.perInvocationResults).toEqual([]);
		});
	}

	it("all NOT_EVALUATED rows yield overallScore 0 and FAILED", async () => {
		const evaluator = new TrajectoryEvaluator({
			metricName: "tool_trajectory_avg_score",
			threshold: 0.5,
		});
		const actual = [
			invocation(undefined),
			invocation({ toolUses: undefined as any, intermediateResponses: [] }),
		];
		const expected = [
			invocation(tools([{ name: "a", args: {} }])),
			invocation(undefined),
		];
		const result = await evaluator.evaluateInvocations(actual, expected);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		expect(
			result.perInvocationResults.every(
				(r) => r.evalStatus === EvalStatus.NOT_EVALUATED,
			),
		).toBe(true);
	});

	const argShapes: Array<{
		label: string;
		actualArgs?: Record<string, unknown> | null;
		expectedArgs?: Record<string, unknown> | null;
		match: boolean;
	}> = [
		{ label: "both omitted", match: true },
		{ label: "both empty", actualArgs: {}, expectedArgs: {}, match: true },
		{ label: "actual null", actualArgs: null, expectedArgs: {}, match: true },
		{ label: "expected null", actualArgs: {}, expectedArgs: null, match: true },
		{
			label: "nested equal",
			actualArgs: { q: { nested: [1, 2] } },
			expectedArgs: { q: { nested: [1, 2] } },
			match: true,
		},
		{
			label: "nested unequal",
			actualArgs: { q: { nested: [1, 2] } },
			expectedArgs: { q: { nested: [1, 3] } },
			match: false,
		},
		{
			label: "key order independent",
			actualArgs: { b: 2, a: 1 },
			expectedArgs: { a: 1, b: 2 },
			match: true,
		},
		{
			label: "extra actual key",
			actualArgs: { a: 1, b: 2 },
			expectedArgs: { a: 1 },
			match: false,
		},
		{
			label: "extra expected key",
			actualArgs: { a: 1 },
			expectedArgs: { a: 1, b: 2 },
			match: false,
		},
		{
			label: "falsy values",
			actualArgs: { flag: false, count: 0, text: "" },
			expectedArgs: { flag: false, count: 0, text: "" },
			match: true,
		},
	];

	for (const shape of argShapes) {
		it(`args coalesce matrix: ${shape.label}`, async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const actualCall: {
				name: string;
				args?: Record<string, unknown> | null;
			} = { name: "tool" };
			const expectedCall: {
				name: string;
				args?: Record<string, unknown> | null;
			} = { name: "tool" };
			if ("actualArgs" in shape) actualCall.args = shape.actualArgs;
			if ("expectedArgs" in shape) expectedCall.args = shape.expectedArgs;
			const result = await evaluator.evaluateInvocations(
				[invocation(tools([actualCall]))],
				[invocation(tools([expectedCall]))],
			);
			expect(result.overallScore).toBe(shape.match ? 1 : 0);
			expect(result.perInvocationResults[0].evalStatus).toBe(
				shape.match ? EvalStatus.PASSED : EvalStatus.FAILED,
			);
		});
	}

	it("length mismatch fails even when shared prefix matches", async () => {
		const evaluator = new TrajectoryEvaluator({
			metricName: "tool_trajectory_avg_score",
			threshold: 1,
		});
		const result = await evaluator.evaluateInvocations(
			[invocation(tools([{ name: "a" }, { name: "b" }]))],
			[invocation(tools([{ name: "a" }]))],
		);
		expect(result.overallScore).toBe(0);
		expect(result.perInvocationResults[0].score).toBe(0);
	});

	it("name mismatch fails with equal-length trajectories", async () => {
		const evaluator = new TrajectoryEvaluator({
			metricName: "tool_trajectory_avg_score",
			threshold: 1,
		});
		const result = await evaluator.evaluateInvocations(
			[invocation(tools([{ name: "search", args: { q: "x" } }]))],
			[invocation(tools([{ name: "lookup", args: { q: "x" } }]))],
		);
		expect(result.overallScore).toBe(0);
	});

	it("mixed evaluated and NOT_EVALUATED averages only evaluated rows", async () => {
		const evaluator = new TrajectoryEvaluator({
			metricName: "tool_trajectory_avg_score",
			threshold: 0.5,
		});
		const actual = [
			invocation(tools([{ name: "ok", args: {} }])),
			invocation(undefined),
			invocation(tools([{ name: "bad", args: { x: 1 } }])),
		];
		const expected = [
			invocation(tools([{ name: "ok", args: {} }])),
			invocation(tools([{ name: "ignored", args: {} }])),
			invocation(tools([{ name: "bad", args: { x: 2 } }])),
		];
		const result = await evaluator.evaluateInvocations(actual, expected);
		expect(result.overallScore).toBe(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[1].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
	});

	it("metric info interval is closed [0,1]", () => {
		const info = TrajectoryEvaluator.getMetricInfo();
		expect(info.metricName).toBe("tool_trajectory_avg_score");
		expect(info.metricValueInfo.interval).toEqual({
			minValue: 0.0,
			maxValue: 1.0,
			openAtMin: false,
			openAtMax: false,
		});
	});

	const multiCallCases = [
		{
			label: "identical multi",
			actual: [
				{ name: "a", args: { i: 1 } },
				{ name: "b", args: { i: 2 } },
			],
			expected: [
				{ name: "a", args: { i: 1 } },
				{ name: "b", args: { i: 2 } },
			],
			score: 1,
		},
		{
			label: "second call differs",
			actual: [
				{ name: "a", args: { i: 1 } },
				{ name: "b", args: { i: 9 } },
			],
			expected: [
				{ name: "a", args: { i: 1 } },
				{ name: "b", args: { i: 2 } },
			],
			score: 0,
		},
		{
			label: "empty trajectories match",
			actual: [],
			expected: [],
			score: 1,
		},
	];

	for (const c of multiCallCases) {
		it(`multi-call trajectory: ${c.label}`, async () => {
			const evaluator = new TrajectoryEvaluator({
				metricName: "tool_trajectory_avg_score",
				threshold: 1,
			});
			const result = await evaluator.evaluateInvocations(
				[invocation(tools(c.actual))],
				[invocation(tools(c.expected))],
			);
			expect(result.overallScore).toBe(c.score);
		});
	}
});
