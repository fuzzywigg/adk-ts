import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { TrajectoryEvaluator } from "../../evaluation/trajectory-evaluator";
import { EvalStatus } from "../../evaluation/evaluator";

function invocation(toolUses?: Invocation["intermediateData"]): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		intermediateData: toolUses,
	};
}

describe("TrajectoryEvaluator", () => {
	const evaluator = new TrajectoryEvaluator({
		metricName: "tool_trajectory_avg_score",
		threshold: 1,
	});

	it("exposes metric info", () => {
		const info = TrajectoryEvaluator.getMetricInfo();
		expect(info.metricName).toBe("tool_trajectory_avg_score");
		expect(info.metricValueInfo.interval?.minValue).toBe(0);
		expect(info.metricValueInfo.interval?.maxValue).toBe(1);
	});

	it("scores perfect tool trajectory matches as passed", async () => {
		const tools = {
			toolUses: [{ name: "search", args: { q: "adk" } }],
			intermediateResponses: [],
		};
		const result = await evaluator.evaluateInvocations(
			[invocation(tools)],
			[invocation(tools)],
		);

		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[0].score).toBe(1);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
	});

	it("scores mismatched names or args as failed", async () => {
		const actual = invocation({
			toolUses: [{ name: "search", args: { q: "adk" } }],
			intermediateResponses: [],
		});
		const expected = invocation({
			toolUses: [{ name: "search", args: { q: "other" } }],
			intermediateResponses: [],
		});

		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("marks invocations without tool uses as not evaluated", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation(undefined)],
			[invocation(undefined)],
		);

		expect(result.perInvocationResults[0].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});
});
