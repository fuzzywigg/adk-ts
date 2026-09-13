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
});
