import { describe, expect, it, vi } from "vitest";
import { AgentEvaluator } from "../../evaluation/agent-evaluator";
import { EvalStatus } from "../../evaluation/evaluator";

/**
 * Eleventh leftover: `_processMetricsAndGetFailures` uses `threshold || 0` —
 * seventh leftover only covers score 0 + threshold 0 PASSED; falsy non-zero
 * thresholds (""/false/NaN/null) coalesce to 0.
 */
describe("agent-evaluator threshold falsy or-zero eleventh leftover edges", () => {
	function failuresFor(threshold: unknown, score: number) {
		return (AgentEvaluator as any)._processMetricsAndGetFailures(
			{
				metric_a: [
					{
						actualInvocation: { creationTimestamp: 1 },
						expectedInvocation: { creationTimestamp: 1 },
						evalMetricResult: {
							metricName: "metric_a",
							threshold,
							score,
							evalStatus: EvalStatus.PASSED,
						},
					},
				],
			},
			false,
			"agent",
		);
	}

	it.each([
		{ label: "empty string", threshold: "" },
		{ label: "false", threshold: false },
		{ label: "null", threshold: null },
		{ label: "undefined", threshold: undefined },
		{ label: "NaN", threshold: Number.NaN },
	])("falsy threshold ($label) coalesces to 0 → score 0.1 PASSED", ({
		threshold,
	}) => {
		expect(failuresFor(threshold, 0.1)).toEqual([]);
	});

	it("intentional threshold 0 stays 0 (control from seventh)", () => {
		expect(failuresFor(0, 0)).toEqual([]);
	});

	it("truthy threshold still fails when score below it", () => {
		const failures = failuresFor(0.5, 0.1);
		expect(failures).toHaveLength(1);
		expect(failures[0]).toMatch(/metric_a/);
	});

	it("printDetailedResults uses coalesced threshold 0 for falsy input", () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const failures = (AgentEvaluator as any)._processMetricsAndGetFailures(
			{
				m: [
					{
						actualInvocation: { creationTimestamp: 1 },
						expectedInvocation: { creationTimestamp: 1 },
						evalMetricResult: {
							metricName: "m",
							threshold: "",
							score: -1,
							evalStatus: EvalStatus.FAILED,
						},
					},
				],
			},
			true,
			"agent",
		);
		expect(failures).toHaveLength(1);
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});
});
