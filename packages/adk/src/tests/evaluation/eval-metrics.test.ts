import { describe, expect, it } from "vitest";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";

describe("PrebuiltMetrics", () => {
	it("exposes expected string values", () => {
		expect(PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE).toBe(
			"tool_trajectory_avg_score",
		);
		expect(PrebuiltMetrics.RESPONSE_EVALUATION_SCORE).toBe(
			"response_evaluation_score",
		);
		expect(PrebuiltMetrics.RESPONSE_MATCH_SCORE).toBe("response_match_score");
		expect(PrebuiltMetrics.SAFETY_V1).toBe("safety_v1");
		expect(PrebuiltMetrics.FINAL_RESPONSE_MATCH_V2).toBe(
			"final_response_match_v2",
		);
		expect(PrebuiltMetrics.TOOL_TRAJECTORY_SCORE).toBe("tool_trajectory_score");
		expect(PrebuiltMetrics.SAFETY).toBe("safety");
		expect(PrebuiltMetrics.RESPONSE_MATCH).toBe("response_match");
	});

	it("includes all known metric names as enum members", () => {
		const values = Object.values(PrebuiltMetrics);
		expect(values).toContain("tool_trajectory_avg_score");
		expect(values).toContain("response_evaluation_score");
		expect(values).toContain("response_match_score");
		expect(values).toContain("safety_v1");
		expect(values).toContain("final_response_match_v2");
		expect(values).toContain("tool_trajectory_score");
		expect(values).toContain("safety");
		expect(values).toContain("response_match");
		expect(values).toHaveLength(8);
	});
});
