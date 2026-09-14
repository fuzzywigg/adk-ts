import { describe, expect, it } from "vitest";
import {
	ALLOWED_CRITERIA,
	MISSING_EVAL_DEPENDENCIES_MESSAGE,
	NUM_RUNS,
	QUERY_COLUMN,
	REFERENCE_COLUMN,
	RESPONSE_EVALUATION_SCORE_THRESHOLD,
	RESPONSE_MATCH_SCORE_THRESHOLD,
	SAFETY_SCORE_THRESHOLD,
	TOOL_TRAJECTORY_SCORE_THRESHOLD,
	EXPECTED_TOOL_USE_COLUMN,
} from "../../evaluation/constants";

describe("evaluation constants", () => {
	it("exposes stable thresholds and columns", () => {
		expect(NUM_RUNS).toBe(4);
		expect(TOOL_TRAJECTORY_SCORE_THRESHOLD).toBe(1);
		expect(RESPONSE_MATCH_SCORE_THRESHOLD).toBe(0.8);
		expect(SAFETY_SCORE_THRESHOLD).toBe(1);
		expect(RESPONSE_EVALUATION_SCORE_THRESHOLD).toBe(1);
		expect(QUERY_COLUMN).toBe("query");
		expect(REFERENCE_COLUMN).toBe("reference");
		expect(EXPECTED_TOOL_USE_COLUMN).toBe("expected_tool_use");
		expect(MISSING_EVAL_DEPENDENCIES_MESSAGE).toContain("pip install");
		expect(ALLOWED_CRITERIA).toContain("tool_trajectory_score");
		expect(ALLOWED_CRITERIA).toContain("response_match_score");
		expect(ALLOWED_CRITERIA).toContain("safety_v1");
	});

	it("ALLOWED_CRITERIA is a readonly tuple with exactly four entries", () => {
		expect(ALLOWED_CRITERIA).toHaveLength(4);
		expect(ALLOWED_CRITERIA).toContain("response_evaluation_score");
		expect([...ALLOWED_CRITERIA]).toEqual([
			"tool_trajectory_score",
			"response_evaluation_score",
			"response_match_score",
			"safety_v1",
		]);
	});

	it("threshold constants are numeric and within expected ranges", () => {
		expect(typeof TOOL_TRAJECTORY_SCORE_THRESHOLD).toBe("number");
		expect(typeof RESPONSE_MATCH_SCORE_THRESHOLD).toBe("number");
		expect(RESPONSE_MATCH_SCORE_THRESHOLD).toBeGreaterThan(0);
		expect(RESPONSE_MATCH_SCORE_THRESHOLD).toBeLessThanOrEqual(1);
		expect(SAFETY_SCORE_THRESHOLD).toBe(TOOL_TRAJECTORY_SCORE_THRESHOLD);
	});

	it("column name constants are non-empty strings", () => {
		expect(QUERY_COLUMN.length).toBeGreaterThan(0);
		expect(REFERENCE_COLUMN.length).toBeGreaterThan(0);
		expect(EXPECTED_TOOL_USE_COLUMN.length).toBeGreaterThan(0);
		expect(QUERY_COLUMN).not.toBe(REFERENCE_COLUMN);
	});

	it("MISSING_EVAL_DEPENDENCIES_MESSAGE mentions pandas and tabulate", () => {
		expect(MISSING_EVAL_DEPENDENCIES_MESSAGE).toContain("pandas");
		expect(MISSING_EVAL_DEPENDENCIES_MESSAGE).toContain("tabulate");
	});

	it("NUM_RUNS is a positive integer", () => {
		expect(NUM_RUNS).toBeGreaterThan(0);
		expect(Number.isInteger(NUM_RUNS)).toBe(true);
	});
});
