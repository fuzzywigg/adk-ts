import { describe, expect, it, vi } from "vitest";
import {
	createEvalSetResult,
	sanitizeEvalSetResultName,
} from "../../evaluation/eval-set-results-manager-utils";
import type { EvalCaseResult } from "../../evaluation/eval-result";
import { EvalStatus } from "../../evaluation/evaluator";

describe("eval-set-results-manager-utils deepen edges (TOKENMAXX remainder)", () => {
	it("sanitize replaces every slash including leading/trailing/doubled", () => {
		expect(sanitizeEvalSetResultName("/a/b/")).toBe("_a_b_");
		expect(sanitizeEvalSetResultName("a//b")).toBe("a__b");
		expect(sanitizeEvalSetResultName("noslash")).toBe("noslash");
		expect(sanitizeEvalSetResultName("")).toBe("");
	});

	it("sanitize leaves underscores and dots untouched", () => {
		expect(sanitizeEvalSetResultName("app_set.1")).toBe("app_set.1");
	});

	it("createEvalSetResult embeds appName_evalSetId_timestamp id shape", () => {
		vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
		const result = createEvalSetResult("myapp", "setA", []);
		expect(result.evalSetResultId).toBe("myapp_setA_1700000000");
		expect(result.evalSetResultName).toBe("myapp_setA_1700000000");
		expect(result.evalSetId).toBe("setA");
		expect(result.creationTimestamp).toBe(1_700_000_000);
		expect(result.evalCaseResults).toEqual([]);
	});

	it("createEvalSetResult sanitizes slashes in the derived name only", () => {
		vi.spyOn(Date, "now").mockReturnValue(2_000);
		const result = createEvalSetResult("org/app", "set/1", []);
		expect(result.evalSetResultId).toBe("org/app_set/1_2");
		expect(result.evalSetResultName).toBe("org_app_set_1_2");
		expect(result.evalSetResultName).not.toContain("/");
	});

	it("createEvalSetResult preserves provided eval case results by reference", () => {
		const cases: EvalCaseResult[] = [
			{
				evalSetId: "set-1",
				evalId: "c1",
				finalEvalStatus: EvalStatus.PASSED,
				overallEvalMetricResults: [],
				evalMetricResultPerInvocation: [],
			},
		];
		const result = createEvalSetResult("app", "set-1", cases);
		expect(result.evalCaseResults).toBe(cases);
		expect(result.evalCaseResults[0].evalId).toBe("c1");
	});

	it("createEvalSetResult uses seconds (Date.now / 1000) for timestamps", () => {
		vi.spyOn(Date, "now").mockReturnValue(5_000);
		const result = createEvalSetResult("a", "b", []);
		expect(result.creationTimestamp).toBe(5);
		expect(result.evalSetResultId.endsWith("_5")).toBe(true);
	});
});
