import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { EvalStatus } from "../../evaluation/evaluator";
import { TrajectoryEvaluator } from "../../evaluation/trajectory-evaluator";

function invocation(toolUses?: Invocation["intermediateData"]): Invocation {
	return {
		userContent: { parts: [{ text: "q" }] },
		creationTimestamp: 1,
		intermediateData: toolUses,
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

/**
 * Leftover: isToolCallEqual uses case-sensitive name !== — Search vs search
 * scores 0 even when args match.
 */
describe("trajectory tool-name case-sensitivity eighth leftover edges", () => {
	it("Search vs search is a mismatch despite identical args", async () => {
		const evaluator = new TrajectoryEvaluator({
			metricName: "tool_trajectory_avg_score",
			threshold: 1,
		});
		const result = await evaluator.evaluateInvocations(
			[invocation(tools([{ name: "Search", args: { q: 1 } }]))],
			[invocation(tools([{ name: "search", args: { q: 1 } }]))],
		);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		expect(result.perInvocationResults[0].score).toBe(0);
	});

	it("SEARCH vs search also mismatches", async () => {
		const evaluator = new TrajectoryEvaluator({
			metricName: "tool_trajectory_avg_score",
			threshold: 0.5,
		});
		const result = await evaluator.evaluateInvocations(
			[invocation(tools([{ name: "SEARCH", args: {} }]))],
			[invocation(tools([{ name: "search", args: {} }]))],
		);
		expect(result.perInvocationResults[0].score).toBe(0);
	});

	it("exact same-case name still matches (control)", async () => {
		const evaluator = new TrajectoryEvaluator({
			metricName: "tool_trajectory_avg_score",
			threshold: 1,
		});
		const result = await evaluator.evaluateInvocations(
			[invocation(tools([{ name: "search", args: { q: 1 } }]))],
			[invocation(tools([{ name: "search", args: { q: 1 } }]))],
		);
		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});
});
