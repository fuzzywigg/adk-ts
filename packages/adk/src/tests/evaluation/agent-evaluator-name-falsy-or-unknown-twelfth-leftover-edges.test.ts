import { afterEach, describe, expect, it, vi } from "vitest";
import {
	AgentEvaluator,
	RESPONSE_MATCH_SCORE_KEY,
} from "../../evaluation/agent-evaluator";
import { EvalStatus } from "../../evaluation/evaluator";
import { LocalEvalService } from "../../evaluation/local-eval-service";

/**
 * Twelfth leftover: `agent.name || "Unknown Agent"` — empty/`false`/`0`/`null`
 * all coalesce (regular tests only cover missing/`undefined`).
 */
describe("agent-evaluator name falsy-or-unknown twelfth leftover edges", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function mockFailedEval(): void {
		vi.spyOn(LocalEvalService.prototype, "performInference").mockImplementation(
			async function* () {
				yield [];
			},
		);
		vi.spyOn(LocalEvalService.prototype, "evaluate").mockImplementation(
			async function* () {
				yield {
					evalSetResultId: "r",
					evalSetId: "set-1",
					evalCaseResults: [
						{
							evalSetId: "set-1",
							evalId: "c1",
							finalEvalStatus: EvalStatus.FAILED,
							overallEvalMetricResults: [],
							evalMetricResultPerInvocation: [
								{
									actualInvocation: { creationTimestamp: 1 },
									expectedInvocation: { creationTimestamp: 1 },
									evalMetricResults: [
										{
											metricName: RESPONSE_MATCH_SCORE_KEY,
											threshold: 0.9,
											score: 0.1,
											evalStatus: EvalStatus.FAILED,
										},
									],
								},
							],
							sessionId: "s",
						},
					],
					creationTimestamp: 1,
				};
			},
		);
	}

	it.each([
		{ label: "empty-string", name: "" },
		{ label: "false", name: false },
		{ label: "0", name: 0 },
		{ label: "null", name: null },
	])("agent.name $label coalesces to Unknown Agent in failure text", async ({
		name,
	}) => {
		mockFailedEval();
		await expect(
			AgentEvaluator.evaluateEvalSet(
				{ name } as any,
				{ evalSetId: "set-1", evalCases: [], creationTimestamp: 1 },
				{ [RESPONSE_MATCH_SCORE_KEY]: 0.9 },
				1,
				false,
			),
		).rejects.toThrow(/Unknown Agent/);
	});

	it("truthy agent.name is used instead of Unknown Agent (control)", async () => {
		mockFailedEval();
		await expect(
			AgentEvaluator.evaluateEvalSet(
				{ name: "named-agent" } as any,
				{ evalSetId: "set-1", evalCases: [], creationTimestamp: 1 },
				{ [RESPONSE_MATCH_SCORE_KEY]: 0.9 },
				1,
				false,
			),
		).rejects.toThrow(/named-agent/);
	});
});
