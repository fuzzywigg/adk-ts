import { describe, expect, it, vi } from "vitest";
import type { EvalCase } from "../../evaluation/eval-case";
import type { EvalSet } from "../../evaluation/eval-set";
import {
	ALLOWED_CRITERIA,
	EXPECTED_TOOL_USE_COLUMN,
	MISSING_EVAL_DEPENDENCIES_MESSAGE,
	NUM_RUNS,
	QUERY_COLUMN,
	REFERENCE_COLUMN,
	RESPONSE_EVALUATION_SCORE_THRESHOLD,
	RESPONSE_MATCH_SCORE_THRESHOLD,
	SAFETY_SCORE_THRESHOLD,
	TOOL_TRAJECTORY_SCORE_THRESHOLD,
} from "../../evaluation/constants";
import {
	createEvalSetResult,
	sanitizeEvalSetResultName,
} from "../../evaluation/eval-set-results-manager-utils";
import {
	addEvalCaseToEvalSet,
	deleteEvalCaseFromEvalSet,
	getEvalCaseFromEvalSet,
	getEvalSetFromAppAndId,
	updateEvalCaseInEvalSet,
} from "../../evaluation/eval-sets-manager-utils";
import type { EvalMetric } from "../../evaluation/eval-metrics";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import {
	DEFAULT_METRIC_EVALUATOR_REGISTRY,
	type EvaluatorConstructor,
	MetricEvaluatorRegistry,
} from "../../evaluation/metric-evaluator-registry";
import { ResponseEvaluator } from "../../evaluation/response-evaluator";
import { TrajectoryEvaluator } from "../../evaluation/trajectory-evaluator";
import { SafetyEvaluatorV1 } from "../../evaluation/safety-evaluator";
import { FinalResponseMatchV2Evaluator } from "../../evaluation/final-response-match-v2";

function makeEvalSet(cases: EvalCase[] = [], evalSetId = "set-1"): EvalSet {
	return {
		evalSetId,
		evalCases: cases,
		creationTimestamp: 1,
	};
}

function makeCase(evalId: string, extra: Partial<EvalCase> = {}): EvalCase {
	return {
		evalId,
		conversation: [],
		...extra,
	};
}

describe("eval-utils leftover edge matrices", () => {
	describe("constants matrix", () => {
		const thresholdPairs: Array<[string, number, number]> = [
			["NUM_RUNS", NUM_RUNS, 4],
			["TOOL_TRAJECTORY_SCORE_THRESHOLD", TOOL_TRAJECTORY_SCORE_THRESHOLD, 1],
			["RESPONSE_MATCH_SCORE_THRESHOLD", RESPONSE_MATCH_SCORE_THRESHOLD, 0.8],
			["SAFETY_SCORE_THRESHOLD", SAFETY_SCORE_THRESHOLD, 1],
			[
				"RESPONSE_EVALUATION_SCORE_THRESHOLD",
				RESPONSE_EVALUATION_SCORE_THRESHOLD,
				1,
			],
		];

		for (const [name, actual, expected] of thresholdPairs) {
			it(`constant ${name} is ${expected}`, () => {
				expect(actual).toBe(expected);
			});
		}

		const columnPairs: Array<[string, string, string]> = [
			["QUERY_COLUMN", QUERY_COLUMN, "query"],
			["REFERENCE_COLUMN", REFERENCE_COLUMN, "reference"],
			[
				"EXPECTED_TOOL_USE_COLUMN",
				EXPECTED_TOOL_USE_COLUMN,
				"expected_tool_use",
			],
		];

		for (const [name, actual, expected] of columnPairs) {
			it(`column ${name} is ${expected}`, () => {
				expect(actual).toBe(expected);
			});
		}

		it("ALLOWED_CRITERIA contains exactly the known set", () => {
			expect([...ALLOWED_CRITERIA].sort()).toEqual(
				[
					"tool_trajectory_score",
					"response_evaluation_score",
					"response_match_score",
					"safety_v1",
				].sort(),
			);
		});

		it("MISSING_EVAL_DEPENDENCIES_MESSAGE mentions pip install", () => {
			expect(MISSING_EVAL_DEPENDENCIES_MESSAGE).toContain("pip install");
			expect(MISSING_EVAL_DEPENDENCIES_MESSAGE).toContain("pandas");
		});
	});

	describe("eval-set-results-manager-utils matrix", () => {
		const sanitizeCases = [
			["plain", "plain"],
			["a/b", "a_b"],
			["a/b/c", "a_b_c"],
			["app/set/123", "app_set_123"],
			["no-slash", "no-slash"],
			["/", "_"],
			["//", "__"],
			["leading/trailing/", "leading_trailing_"],
			["mix_under/and-slash", "mix_under_and-slash"],
		];

		for (const [input, expected] of sanitizeCases) {
			it(`sanitizeEvalSetResultName(${JSON.stringify(input)})`, () => {
				expect(sanitizeEvalSetResultName(input)).toBe(expected);
			});
		}

		const createCombos: Array<{
			appName: string;
			evalSetId: string;
			resultsLen: number;
		}> = [
			{ appName: "app", evalSetId: "set", resultsLen: 0 },
			{ appName: "demo/app", evalSetId: "set-1", resultsLen: 0 },
			{ appName: "x/y/z", evalSetId: "s", resultsLen: 1 },
			{ appName: "plain", evalSetId: "id", resultsLen: 2 },
		];

		for (const { appName, evalSetId, resultsLen } of createCombos) {
			it(`createEvalSetResult ${appName} / ${evalSetId} / n=${resultsLen}`, () => {
				const caseResults = Array.from({ length: resultsLen }, (_, i) => ({
					evalSetId,
					evalId: `c${i}`,
				})) as any[];
				const result = createEvalSetResult(appName, evalSetId, caseResults);
				expect(result.evalSetId).toBe(evalSetId);
				expect(result.evalSetResultId).toContain(`${appName}_${evalSetId}_`);
				expect(result.evalSetResultName).toBe(
					sanitizeEvalSetResultName(result.evalSetResultId),
				);
				expect(result.evalSetResultName).not.toContain("/");
				expect(result.evalCaseResults).toHaveLength(resultsLen);
				expect(result.creationTimestamp).toBeGreaterThan(0);
			});
		}
	});

	describe("eval-sets-manager-utils matrix", () => {
		const ids = ["a", "b", "c", "missing", "dup"];

		for (const id of ids) {
			it(`getEvalCaseFromEvalSet lookup ${id}`, () => {
				const evalSet = makeEvalSet([
					makeCase("a"),
					makeCase("b"),
					makeCase("c"),
				]);
				const found = getEvalCaseFromEvalSet(evalSet, id);
				if (["a", "b", "c"].includes(id)) {
					expect(found?.evalId).toBe(id);
				} else {
					expect(found).toBeUndefined();
				}
			});
		}

		it("adds many cases then rejects duplicate of each", () => {
			const evalSet = makeEvalSet();
			for (const id of ["x", "y", "z"]) {
				addEvalCaseToEvalSet(evalSet, makeCase(id));
			}
			expect(evalSet.evalCases.map((c) => c.evalId)).toEqual(["x", "y", "z"]);
			for (const id of ["x", "y", "z"]) {
				expect(() => addEvalCaseToEvalSet(evalSet, makeCase(id))).toThrow(
					/already exists/,
				);
			}
		});

		const updateMatrix = [
			{ id: "a", ok: true },
			{ id: "b", ok: true },
			{ id: "ghost", ok: false },
		];

		for (const { id, ok } of updateMatrix) {
			it(`updateEvalCaseInEvalSet ${id} ok=${ok}`, () => {
				const evalSet = makeEvalSet([makeCase("a"), makeCase("b")]);
				const updated = makeCase(id, {
					conversation: [
						{
							userContent: { parts: [{ text: "u" }] },
							creationTimestamp: 1,
						},
					],
				});
				if (ok) {
					updateEvalCaseInEvalSet(evalSet, updated);
					expect(
						getEvalCaseFromEvalSet(evalSet, id)?.conversation,
					).toHaveLength(1);
				} else {
					expect(() => updateEvalCaseInEvalSet(evalSet, updated)).toThrow(
						/not found/,
					);
				}
			});
		}

		const deleteMatrix = [
			{ start: ["a", "b", "c"], del: "a", remain: ["b", "c"] },
			{ start: ["a", "b", "c"], del: "c", remain: ["a", "b"] },
			{ start: ["only"], del: "only", remain: [] },
		];

		for (const { start, del, remain } of deleteMatrix) {
			it(`deleteEvalCaseFromEvalSet ${del} from [${start}]`, () => {
				const evalSet = makeEvalSet(start.map((id) => makeCase(id)));
				deleteEvalCaseFromEvalSet(evalSet, del);
				expect(evalSet.evalCases.map((c) => c.evalId)).toEqual(remain);
			});
		}

		it("delete missing id throws", () => {
			const evalSet = makeEvalSet([makeCase("a")]);
			expect(() => deleteEvalCaseFromEvalSet(evalSet, "nope")).toThrow(
				/not found/,
			);
		});

		it("getEvalSetFromAppAndId resolves or throws", async () => {
			const evalSet = makeEvalSet([makeCase("a")], "set-1");
			const manager = {
				getEvalSet: async (_app: string, id: string) =>
					id === "set-1" ? evalSet : undefined,
			};
			await expect(
				getEvalSetFromAppAndId(manager as any, "app", "set-1"),
			).resolves.toBe(evalSet);
			await expect(
				getEvalSetFromAppAndId(manager as any, "app", "missing"),
			).rejects.toThrow(/not found/);
		});
	});

	describe("metric-evaluator-registry leftover matrix", () => {
		class StubA {
			constructor(public metric: EvalMetric) {}
			static getMetricInfo() {
				return {
					metricName: "stub_a",
					description: "a",
					defaultThreshold: 0.1,
				};
			}
			async evaluateInvocations() {
				return {
					overallScore: 1,
					overallEvalStatus: 1,
					perInvocationResults: [],
				};
			}
		}

		class StubB {
			constructor(public metric: EvalMetric) {}
			static getMetricInfo() {
				return {
					metricName: "stub_b",
					description: "b",
					defaultThreshold: 0.2,
				};
			}
			async evaluateInvocations() {
				return {
					overallScore: 0,
					overallEvalStatus: 0,
					perInvocationResults: [],
				};
			}
		}

		const StubAClass = StubA as unknown as EvaluatorConstructor;
		const StubBClass = StubB as unknown as EvaluatorConstructor;

		it("registers multiple distinct metrics", () => {
			const registry = new MetricEvaluatorRegistry();
			registry.registerEvaluator(StubA.getMetricInfo(), StubAClass);
			registry.registerEvaluator(StubB.getMetricInfo(), StubBClass);
			expect(registry.getRegisteredMetrics()).toHaveLength(2);
			expect(
				registry.getEvaluator({ metricName: "stub_a", threshold: 0.5 }),
			).toBeInstanceOf(StubA);
			expect(
				registry.getEvaluator({ metricName: "stub_b", threshold: 0.9 }),
			).toBeInstanceOf(StubB);
		});

		it("update path logs when re-registering same metric", () => {
			const registry = new MetricEvaluatorRegistry();
			const info = vi.spyOn(console, "info").mockImplementation(() => {});
			registry.registerEvaluator(StubA.getMetricInfo(), StubAClass);
			registry.registerEvaluator(StubA.getMetricInfo(), StubBClass);
			expect(info).toHaveBeenCalled();
			expect(
				registry.getEvaluator({ metricName: "stub_a", threshold: 1 }),
			).toBeInstanceOf(StubB);
		});

		const unknownNames = ["missing", "nope", "", "TOOL_TRAJECTORY_AVG_SCORE"];
		for (const name of unknownNames) {
			it(`throws for unknown metric ${JSON.stringify(name)}`, () => {
				const registry = new MetricEvaluatorRegistry();
				expect(() =>
					registry.getEvaluator({ metricName: name, threshold: 1 }),
				).toThrow(/not found in registry/);
			});
		}

		const prebuilt: Array<{
			metric: PrebuiltMetrics;
			ctor: new (...args: any[]) => unknown;
		}> = [
			{
				metric: PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
				ctor: TrajectoryEvaluator,
			},
			{
				metric: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
				ctor: ResponseEvaluator,
			},
			{
				metric: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
				ctor: ResponseEvaluator,
			},
			{ metric: PrebuiltMetrics.SAFETY_V1, ctor: SafetyEvaluatorV1 },
			{
				metric: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				ctor: FinalResponseMatchV2Evaluator,
			},
		];

		for (const { metric, ctor } of prebuilt) {
			it(`default registry resolves ${metric}`, () => {
				const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
					metricName: metric,
					threshold: 0.5,
				});
				expect(evaluator).toBeInstanceOf(ctor);
			});
		}

		it("getRegisteredMetrics returns copies not live refs", () => {
			const registry = new MetricEvaluatorRegistry();
			registry.registerEvaluator(StubA.getMetricInfo(), StubAClass);
			const first = registry.getRegisteredMetrics();
			first[0].description = "mutated";
			expect(registry.getRegisteredMetrics()[0].description).toBe("a");
		});

		const thresholds = [0, 0.1, 0.5, 1, 2];
		for (const threshold of thresholds) {
			it(`getEvaluator preserves threshold ${threshold}`, () => {
				const registry = new MetricEvaluatorRegistry();
				registry.registerEvaluator(StubA.getMetricInfo(), StubAClass);
				const evaluator = registry.getEvaluator({
					metricName: "stub_a",
					threshold,
				}) as unknown as StubA;
				expect(evaluator.metric.threshold).toBe(threshold);
			});
		}
	});
});
