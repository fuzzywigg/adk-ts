import { describe, expect, it } from "vitest";
import {
	createEvalSetResult,
	sanitizeEvalSetResultName,
} from "../../evaluation/eval-set-results-manager-utils";

describe("eval-set-results-manager-utils", () => {
	it("sanitizes slashes in result names", () => {
		expect(sanitizeEvalSetResultName("app/set/123")).toBe("app_set_123");
	});

	it("creates eval set results with sanitized ids", () => {
		const result = createEvalSetResult("demo/app", "set-1", []);
		expect(result.evalSetId).toBe("set-1");
		expect(result.evalSetResultId).toContain("demo/app_set-1_");
		expect(result.evalSetResultName).toBe(
			sanitizeEvalSetResultName(result.evalSetResultId),
		);
		expect(result.evalSetResultName).not.toContain("/");
		expect(result.evalCaseResults).toEqual([]);
		expect(result.creationTimestamp).toBeGreaterThan(0);
	});
});
