import { describe, expect, it } from "vitest";
import { AgentEvaluator } from "../../evaluation/agent-evaluator";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalResult } from "../../evaluation/eval-result";
import { EvalStatus } from "../../evaluation/evaluator";
import { TrajectoryEvaluator } from "../../evaluation/trajectory-evaluator";

function trajInv(toolUses: any): Invocation {
	return {
		userContent: { parts: [{ text: "q" }] },
		creationTimestamp: 1,
		intermediateData: { toolUses, intermediateResponses: [] },
	};
}

/**
 * Nineteenth leftover (evaluation residual): threshold `"0"` truthy keep,
 * creationTimestamp string-zero keep, toolUses falsy non-nullish NOT_EVALUATED.
 */
describe("evaluation threshold/timestamp/toolUses nineteenth leftover", () => {
	it('threshold string "0" is truthy so stays "0"; score 0.1 >= "0" PASSED', () => {
		const failures = (AgentEvaluator as any)._processMetricsAndGetFailures(
			{
				metric_a: [
					{
						actualInvocation: { creationTimestamp: 1 },
						expectedInvocation: { creationTimestamp: 1 },
						evalMetricResult: {
							metricName: "metric_a",
							threshold: "0",
							score: 0.1,
							evalStatus: EvalStatus.PASSED,
						},
					},
				],
			},
			false,
			"agent",
		);
		expect(failures).toEqual([]);
	});

	it('EvalResult creationTimestamp "0" is kept via ||', () => {
		const result = new EvalResult({
			evalSetResultId: "id",
			evalSetResultName: "n",
			evalSetId: "s",
			evalCaseResults: [],
			creationTimestamp: "0" as any,
		});
		expect(result.creationTimestamp).toBe("0");
	});

	it("EvalResult creationTimestamp 0 coalesces to Date.now()/1000", () => {
		const before = Date.now() / 1000;
		const result = new EvalResult({
			evalSetResultId: "id",
			evalSetResultName: "n",
			evalSetId: "s",
			evalCaseResults: [],
			creationTimestamp: 0,
		});
		expect(result.creationTimestamp).toBeGreaterThanOrEqual(before - 1);
		expect(result.creationTimestamp).not.toBe(0);
	});

	it.each([
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: "empty-string", value: "" },
	])("toolUses=$label is falsy → NOT_EVALUATED", async ({ value }) => {
		const evaluator = new TrajectoryEvaluator({
			metricName: PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
			threshold: 1,
		});
		const result = await evaluator.evaluateInvocations(
			[trajInv(value)],
			[trajInv([])],
		);
		expect(result.perInvocationResults[0].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
	});

	it("empty toolUses arrays still evaluate (control)", async () => {
		const evaluator = new TrajectoryEvaluator({
			metricName: PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
			threshold: 1,
		});
		const result = await evaluator.evaluateInvocations(
			[trajInv([])],
			[trajInv([])],
		);
		expect(result.perInvocationResults[0].evalStatus).not.toBe(
			EvalStatus.NOT_EVALUATED,
		);
	});
});
