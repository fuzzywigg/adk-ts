import { describe, expect, it, vi } from "vitest";
import { EvalResult } from "../../evaluation/eval-result";
import { EvalStatus } from "../../evaluation/evaluator";

function makeCaseResult(overrides: Record<string, unknown> = {}) {
	return {
		evalSetId: "set-1",
		evalId: "case-1",
		finalEvalStatus: EvalStatus.PASSED,
		overallEvalMetricResults: [],
		evalMetricResultPerInvocation: [],
		sessionId: "sess-1",
		...overrides,
	};
}

describe("EvalResult leftover edges", () => {
	describe("evalSetResultId matrix", () => {
		it("defaults undefined evalSetResultId to empty string", () => {
			const result = new EvalResult({ evalSetResultId: undefined });
			expect(result.evalSetResultId).toBe("");
		});

		it("defaults null evalSetResultId to empty string", () => {
			const result = new EvalResult({
				evalSetResultId: null as unknown as string,
			});
			expect(result.evalSetResultId).toBe("");
		});

		it("preserves empty string evalSetResultId", () => {
			const result = new EvalResult({ evalSetResultId: "" });
			expect(result.evalSetResultId).toBe("");
		});

		it("preserves non-empty evalSetResultId", () => {
			const result = new EvalResult({ evalSetResultId: "result-42" });
			expect(result.evalSetResultId).toBe("result-42");
		});
	});

	describe("evalSetId matrix", () => {
		it("defaults undefined evalSetId to empty string", () => {
			const result = new EvalResult({ evalSetId: undefined });
			expect(result.evalSetId).toBe("");
		});

		it("defaults null evalSetId to empty string", () => {
			const result = new EvalResult({ evalSetId: null as unknown as string });
			expect(result.evalSetId).toBe("");
		});

		it("preserves empty string evalSetId", () => {
			const result = new EvalResult({ evalSetId: "" });
			expect(result.evalSetId).toBe("");
		});

		it("preserves non-empty evalSetId", () => {
			const result = new EvalResult({ evalSetId: "set-99" });
			expect(result.evalSetId).toBe("set-99");
		});
	});

	describe("creationTimestamp matrix", () => {
		it("defaults undefined creationTimestamp to Date.now()/1000", () => {
			const before = Date.now() / 1000;
			const result = new EvalResult({ creationTimestamp: undefined });
			const after = Date.now() / 1000;
			expect(result.creationTimestamp).toBeGreaterThanOrEqual(before);
			expect(result.creationTimestamp).toBeLessThanOrEqual(after);
		});

		it("defaults null creationTimestamp via || to Date.now()/1000", () => {
			vi.spyOn(Date, "now").mockReturnValue(50_000);
			const result = new EvalResult({
				creationTimestamp: null as unknown as number,
			});
			expect(result.creationTimestamp).toBe(50);
			vi.restoreAllMocks();
		});

		it("preserves creationTimestamp 0 via || fallback to now", () => {
			vi.spyOn(Date, "now").mockReturnValue(99_000);
			const result = new EvalResult({ creationTimestamp: 0 });
			expect(result.creationTimestamp).toBe(99);
			vi.restoreAllMocks();
		});

		it("preserves positive creationTimestamp", () => {
			const result = new EvalResult({ creationTimestamp: 1_700_000_000 });
			expect(result.creationTimestamp).toBe(1_700_000_000);
		});

		it("preserves fractional creationTimestamp", () => {
			const result = new EvalResult({ creationTimestamp: 1.5 });
			expect(result.creationTimestamp).toBe(1.5);
		});
	});

	describe("evalCaseResults matrix", () => {
		it("defaults undefined evalCaseResults to empty array", () => {
			const result = new EvalResult({ evalCaseResults: undefined });
			expect(result.evalCaseResults).toEqual([]);
		});

		it("defaults null evalCaseResults to empty array via ||", () => {
			const result = new EvalResult({
				evalCaseResults: null as unknown as [],
			});
			expect(result.evalCaseResults).toEqual([]);
		});

		it("preserves provided evalCaseResults array", () => {
			const cases = [
				makeCaseResult({ evalId: "a" }),
				makeCaseResult({ evalId: "b" }),
			];
			const result = new EvalResult({ evalCaseResults: cases });
			expect(result.evalCaseResults).toEqual(cases);
			expect(result.evalCaseResults).toHaveLength(2);
		});

		it("preserves empty evalCaseResults array explicitly", () => {
			const result = new EvalResult({ evalCaseResults: [] });
			expect(result.evalCaseResults).toEqual([]);
		});
	});

	describe("evalSetResultName handling", () => {
		it("omits evalSetResultName when init is undefined", () => {
			const result = new EvalResult({});
			expect(result.evalSetResultName).toBeUndefined();
			expect("evalSetResultName" in result).toBe(true);
		});

		it("keeps evalSetResultName when provided as non-empty string", () => {
			const result = new EvalResult({ evalSetResultName: "My Run" });
			expect(result.evalSetResultName).toBe("My Run");
		});

		it("keeps evalSetResultName when provided as empty string", () => {
			const result = new EvalResult({ evalSetResultName: "" });
			expect(result.evalSetResultName).toBe("");
		});

		it("does not coerce undefined evalSetResultName to empty string", () => {
			const result = new EvalResult({ evalSetResultName: undefined });
			expect(result.evalSetResultName).toBeUndefined();
		});
	});

	describe("combined init matrices", () => {
		it("applies all defaults when init is completely empty", () => {
			vi.spyOn(Date, "now").mockReturnValue(120_000);
			const result = new EvalResult({});
			expect(result.evalSetResultId).toBe("");
			expect(result.evalSetId).toBe("");
			expect(result.evalSetResultName).toBeUndefined();
			expect(result.evalCaseResults).toEqual([]);
			expect(result.creationTimestamp).toBe(120);
			vi.restoreAllMocks();
		});

		it("accepts full explicit init without mutation of input", () => {
			const cases = [makeCaseResult()];
			const init = {
				evalSetResultId: "r1",
				evalSetResultName: "named",
				evalSetId: "s1",
				evalCaseResults: cases,
				creationTimestamp: 99,
			};
			const result = new EvalResult(init);
			expect(result.evalSetResultId).toBe("r1");
			expect(result.evalSetResultName).toBe("named");
			expect(result.evalSetId).toBe("s1");
			expect(result.evalCaseResults).toBe(cases);
			expect(result.creationTimestamp).toBe(99);
		});

		it("creates independent evalCaseResults array per instance", () => {
			const shared = [makeCaseResult()];
			const a = new EvalResult({ evalCaseResults: shared });
			const b = new EvalResult({ evalCaseResults: [] });
			shared.push(makeCaseResult({ evalId: "extra" }));
			expect(a.evalCaseResults).toHaveLength(2);
			expect(b.evalCaseResults).toHaveLength(0);
		});
	});

	describe("instance shape", () => {
		it("implements EvalSetResult interface fields", () => {
			const result = new EvalResult({
				evalSetResultId: "id",
				evalSetId: "set",
				creationTimestamp: 1,
			});
			expect(result).toHaveProperty("evalSetResultId");
			expect(result).toHaveProperty("evalSetId");
			expect(result).toHaveProperty("evalCaseResults");
			expect(result).toHaveProperty("creationTimestamp");
		});

		it("allows reassignment of mutable fields after construction", () => {
			const result = new EvalResult({});
			result.evalSetResultId = "new-id";
			result.evalCaseResults = [makeCaseResult()];
			expect(result.evalSetResultId).toBe("new-id");
			expect(result.evalCaseResults).toHaveLength(1);
		});
	});
});
