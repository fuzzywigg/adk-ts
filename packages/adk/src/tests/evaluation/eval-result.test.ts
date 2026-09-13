import { describe, expect, it, vi } from "vitest";
import { EvalResult } from "../../evaluation/eval-result";
import { EvalStatus } from "../../evaluation/evaluator";

describe("EvalResult", () => {
	it("applies defaults for missing fields", () => {
		const before = Date.now() / 1000;
		const result = new EvalResult({});
		const after = Date.now() / 1000;

		expect(result.evalSetResultId).toBe("");
		expect(result.evalSetResultName).toBeUndefined();
		expect(result.evalSetId).toBe("");
		expect(result.evalCaseResults).toEqual([]);
		expect(result.creationTimestamp).toBeGreaterThanOrEqual(before);
		expect(result.creationTimestamp).toBeLessThanOrEqual(after);
	});

	it("uses provided overrides", () => {
		const caseResult = {
			evalSetId: "set-1",
			evalId: "case-1",
			finalEvalStatus: EvalStatus.PASSED,
			overallEvalMetricResults: [],
			evalMetricResultPerInvocation: [],
			sessionId: "sess-1",
		};

		const result = new EvalResult({
			evalSetResultId: "result-1",
			evalSetResultName: "named",
			evalSetId: "set-1",
			evalCaseResults: [caseResult],
			creationTimestamp: 42,
		});

		expect(result.evalSetResultId).toBe("result-1");
		expect(result.evalSetResultName).toBe("named");
		expect(result.evalSetId).toBe("set-1");
		expect(result.evalCaseResults).toEqual([caseResult]);
		expect(result.creationTimestamp).toBe(42);
	});

	it("treats falsy ids as empty defaults", () => {
		vi.spyOn(Date, "now").mockReturnValue(10_000);
		const result = new EvalResult({
			evalSetResultId: "",
			evalSetId: "",
			evalCaseResults: undefined,
			creationTimestamp: 0,
		});

		expect(result.evalSetResultId).toBe("");
		expect(result.evalSetId).toBe("");
		expect(result.evalCaseResults).toEqual([]);
		expect(result.creationTimestamp).toBe(10);
		vi.restoreAllMocks();
	});
});
