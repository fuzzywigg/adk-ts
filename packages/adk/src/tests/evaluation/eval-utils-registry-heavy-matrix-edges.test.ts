import { describe, expect, it, vi } from "vitest";
import type { EvalCase } from "../../evaluation/eval-case";
import type { EvalMetric } from "../../evaluation/eval-metrics";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalResult } from "../../evaluation/eval-result";
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
	EvalStatus,
	Evaluator,
	type EvaluationResult,
} from "../../evaluation/evaluator";
import type { Invocation } from "../../evaluation/eval-case";
import {
	DEFAULT_METRIC_EVALUATOR_REGISTRY,
	type EvaluatorConstructor,
	MetricEvaluatorRegistry,
} from "../../evaluation/metric-evaluator-registry";
import { ResponseEvaluator } from "../../evaluation/response-evaluator";
import { TrajectoryEvaluator } from "../../evaluation/trajectory-evaluator";
import { FinalResponseMatchV2Evaluator } from "../../evaluation/final-response-match-v2";
import { RougeEvaluator } from "../../evaluation/final-response-match-v1";

class StubEvaluator {
	constructor(public metric: EvalMetric) {}

	static getMetricInfo() {
		return {
			metricName: "stub_matrix_metric",
			description: "stub",
			defaultThreshold: 0.5,
		};
	}

	async evaluateInvocations() {
		return {
			overallScore: 1,
			overallEvalStatus: EvalStatus.PASSED,
			perInvocationResults: [],
		};
	}
}

class StatusMatrixEvaluator extends Evaluator {
	constructor(
		metric: EvalMetric,
		private readonly status: EvalStatus,
		private readonly score?: number,
	) {
		super(metric);
	}

	async evaluateInvocations(
		_actual: Invocation[],
		_expected: Invocation[],
	): Promise<EvaluationResult> {
		return {
			overallScore: this.score,
			overallEvalStatus: this.status,
			perInvocationResults: [
				{
					actualInvocation: {
						userContent: { parts: [{ text: "a" }] },
						creationTimestamp: 1,
					},
					expectedInvocation: {
						userContent: { parts: [{ text: "e" }] },
						creationTimestamp: 1,
					},
					score: this.score,
					evalStatus: this.status,
				},
			],
		};
	}
}

const StubEvaluatorClass = StubEvaluator as unknown as EvaluatorConstructor;

function makeEvalSet(cases: EvalCase[] = []): EvalSet {
	return {
		evalSetId: "set-1",
		evalCases: cases,
		creationTimestamp: 1,
	};
}

function makeCase(evalId: string): EvalCase {
	return { evalId, conversation: [] };
}

describe("eval utils + registry + status heavy matrix edges", () => {
	describe("MetricEvaluatorRegistry matrices", () => {
		it("registers and resolves custom metrics with thresholds", () => {
			const registry = new MetricEvaluatorRegistry();
			registry.registerEvaluator(
				StubEvaluator.getMetricInfo(),
				StubEvaluatorClass,
			);
			for (const threshold of [0, 0.25, 0.5, 0.75, 1]) {
				const evaluator = registry.getEvaluator({
					metricName: "stub_matrix_metric",
					threshold,
				});
				expect((evaluator as unknown as StubEvaluator).metric.threshold).toBe(
					threshold,
				);
			}
		});

		it("throws for unknown metrics with the metric name in the message", () => {
			const registry = new MetricEvaluatorRegistry();
			expect(() =>
				registry.getEvaluator({ metricName: "nope_metric", threshold: 1 }),
			).toThrow("nope_metric not found in registry.");
		});

		it("logs info when re-registering the same metric", () => {
			const registry = new MetricEvaluatorRegistry();
			const info = vi.spyOn(console, "info").mockImplementation(() => {});
			registry.registerEvaluator(
				StubEvaluator.getMetricInfo(),
				StubEvaluatorClass,
			);
			registry.registerEvaluator(
				StubEvaluator.getMetricInfo(),
				StubEvaluatorClass,
			);
			expect(info).toHaveBeenCalled();
			info.mockRestore();
		});

		it.each([
			PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
			PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
			PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			PrebuiltMetrics.SAFETY_V1,
			PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
		])("default registry contains prebuilt metric %s", (metricName) => {
			const names =
				DEFAULT_METRIC_EVALUATOR_REGISTRY.getRegisteredMetrics().map(
					(m) => m.metricName,
				);
			expect(names).toContain(metricName);
		});

		it("resolves RESPONSE_MATCH_SCORE to ResponseEvaluator", () => {
			const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
				threshold: 0.7,
			});
			expect(evaluator).toBeInstanceOf(ResponseEvaluator);
			expect(RougeEvaluator.getMetricInfo().metricName).toBe(
				PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			);
		});

		it("resolves TOOL_TRAJECTORY_AVG_SCORE to TrajectoryEvaluator", () => {
			const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
				metricName: PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
				threshold: 1,
			});
			expect(evaluator).toBeInstanceOf(TrajectoryEvaluator);
		});

		it("resolves FINAL_RESPONSE_MATCH_V2 to FinalResponseMatchV2Evaluator", () => {
			const evaluator = DEFAULT_METRIC_EVALUATOR_REGISTRY.getEvaluator({
				metricName: PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2,
				threshold: 0.6,
			});
			expect(evaluator).toBeInstanceOf(FinalResponseMatchV2Evaluator);
		});

		it("getRegisteredMetrics returns a fresh array snapshot", () => {
			const a = DEFAULT_METRIC_EVALUATOR_REGISTRY.getRegisteredMetrics();
			const b = DEFAULT_METRIC_EVALUATOR_REGISTRY.getRegisteredMetrics();
			expect(a).not.toBe(b);
			expect(a.length).toBe(b.length);
		});
	});

	describe("eval-sets-manager-utils matrices", () => {
		it("finds cases among many ids and misses unknowns", () => {
			const ids = Array.from({ length: 12 }, (_, i) => `c${i}`);
			const evalSet = makeEvalSet(ids.map(makeCase));
			expect(getEvalCaseFromEvalSet(evalSet, "c0")?.evalId).toBe("c0");
			expect(getEvalCaseFromEvalSet(evalSet, "c11")?.evalId).toBe("c11");
			expect(getEvalCaseFromEvalSet(evalSet, "c12")).toBeUndefined();
		});

		it("adds cases and rejects duplicates for unicode ids", () => {
			const evalSet = makeEvalSet([makeCase("α")]);
			addEvalCaseToEvalSet(evalSet, makeCase("β"));
			expect(evalSet.evalCases.map((c) => c.evalId)).toEqual(["α", "β"]);
			expect(() => addEvalCaseToEvalSet(evalSet, makeCase("α"))).toThrow(
				/already exists/,
			);
		});

		it("updates existing cases and rejects missing ids", () => {
			const evalSet = makeEvalSet([makeCase("a")]);
			updateEvalCaseInEvalSet(evalSet, {
				evalId: "a",
				conversation: [
					{
						userContent: { parts: [{ text: "hi" }] },
						creationTimestamp: 1,
					},
				],
			});
			expect(evalSet.evalCases[0].conversation).toHaveLength(1);
			expect(() =>
				updateEvalCaseInEvalSet(evalSet, makeCase("missing")),
			).toThrow(/not found/);
		});

		it("deletes cases and rejects second delete", () => {
			const evalSet = makeEvalSet([
				makeCase("a"),
				makeCase("b"),
				makeCase("c"),
			]);
			deleteEvalCaseFromEvalSet(evalSet, "b");
			expect(evalSet.evalCases.map((c) => c.evalId)).toEqual(["a", "c"]);
			expect(() => deleteEvalCaseFromEvalSet(evalSet, "b")).toThrow(
				/not found/,
			);
		});

		it("getEvalSetFromAppAndId resolves or throws with backticks", async () => {
			const evalSet = makeEvalSet([makeCase("a")]);
			const manager = {
				getEvalSet: async (_app: string, id: string) =>
					id === "set-1" ? evalSet : undefined,
			};
			await expect(
				getEvalSetFromAppAndId(manager as never, "app", "set-1"),
			).resolves.toBe(evalSet);
			await expect(
				getEvalSetFromAppAndId(manager as never, "app", "missing"),
			).rejects.toThrow(/Eval set `missing` not found/);
		});
	});

	describe("eval-set-results-manager-utils matrices", () => {
		it.each([
			["app/set/123", "app_set_123"],
			["solo", "solo"],
			["a/b", "a_b"],
			["x/y/z/w", "x_y_z_w"],
			["no-slash", "no-slash"],
		])("sanitizeEvalSetResultName(%s) → %s", (input, expected) => {
			expect(sanitizeEvalSetResultName(input)).toBe(expected);
		});

		it("createEvalSetResult sanitizes ids and stamps timestamps", () => {
			const before = Date.now() / 1000;
			const result = createEvalSetResult("demo/app", "set-1", []);
			const after = Date.now() / 1000;
			expect(result.evalSetId).toBe("set-1");
			expect(result.evalSetResultId).toContain("demo/app_set-1_");
			expect(result.evalSetResultName).not.toContain("/");
			expect(result.evalCaseResults).toEqual([]);
			expect(result.creationTimestamp).toBeGreaterThanOrEqual(before);
			expect(result.creationTimestamp).toBeLessThanOrEqual(after);
		});

		it("createEvalSetResult preserves provided case results", () => {
			const caseResult = {
				evalSetId: "set-1",
				evalId: "case-1",
				finalEvalStatus: EvalStatus.PASSED,
				overallEvalMetricResults: [],
				evalMetricResultPerInvocation: [],
				sessionId: "sess",
			};
			const result = createEvalSetResult("app", "set-1", [caseResult]);
			expect(result.evalCaseResults).toEqual([caseResult]);
		});
	});

	describe("constants matrices", () => {
		it("exposes stable numeric thresholds", () => {
			expect(NUM_RUNS).toBe(4);
			expect(TOOL_TRAJECTORY_SCORE_THRESHOLD).toBe(1);
			expect(RESPONSE_MATCH_SCORE_THRESHOLD).toBe(0.8);
			expect(SAFETY_SCORE_THRESHOLD).toBe(1);
			expect(RESPONSE_EVALUATION_SCORE_THRESHOLD).toBe(1);
		});

		it("exposes stable column names", () => {
			expect(QUERY_COLUMN).toBe("query");
			expect(REFERENCE_COLUMN).toBe("reference");
			expect(EXPECTED_TOOL_USE_COLUMN).toBe("expected_tool_use");
		});

		it("documents missing dependency and allowed criteria", () => {
			expect(MISSING_EVAL_DEPENDENCIES_MESSAGE).toContain("pip install");
			expect(ALLOWED_CRITERIA).toEqual(
				expect.arrayContaining([
					"tool_trajectory_score",
					"response_match_score",
					"safety_v1",
				]),
			);
			expect(ALLOWED_CRITERIA.length).toBeGreaterThanOrEqual(3);
		});
	});

	describe("EvalResult + EvalStatus matrices", () => {
		it.each([
			[EvalStatus.PASSED, 1],
			[EvalStatus.FAILED, 2],
			[EvalStatus.NOT_EVALUATED, 3],
		])("EvalStatus enum %s equals %s", (status, value) => {
			expect(status).toBe(value);
		});

		it("EvalResult applies defaults for missing fields", () => {
			const result = new EvalResult({});
			expect(result.evalSetResultId).toBe("");
			expect(result.evalSetId).toBe("");
			expect(result.evalCaseResults).toEqual([]);
			expect(result.creationTimestamp).toBeGreaterThan(0);
		});

		it("EvalResult uses provided overrides", () => {
			const result = new EvalResult({
				evalSetResultId: "r1",
				evalSetResultName: "named",
				evalSetId: "set",
				evalCaseResults: [],
				creationTimestamp: 42,
			});
			expect(result.evalSetResultId).toBe("r1");
			expect(result.evalSetResultName).toBe("named");
			expect(result.evalSetId).toBe("set");
			expect(result.creationTimestamp).toBe(42);
		});

		it("Evaluator.getMetricInfo throws until subclassed", () => {
			expect(() => Evaluator.getMetricInfo()).toThrow(
				/must be implemented by subclass/,
			);
		});

		it.each([
			[EvalStatus.PASSED, 1],
			[EvalStatus.FAILED, 0],
			[EvalStatus.NOT_EVALUATED, undefined],
		])("StatusMatrixEvaluator returns status %s with score %s", async (status, score) => {
			const evaluator = new StatusMatrixEvaluator(
				{ metricName: "matrix", threshold: 0.5 },
				status,
				score,
			);
			const result = await evaluator.evaluateInvocations([], []);
			expect(result.overallEvalStatus).toBe(status);
			expect(result.overallScore).toBe(score);
			expect(result.perInvocationResults[0].evalStatus).toBe(status);
		});
	});
});
