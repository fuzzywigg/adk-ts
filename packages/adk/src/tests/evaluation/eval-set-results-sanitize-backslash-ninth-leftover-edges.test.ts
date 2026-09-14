import { describe, expect, it } from "vitest";
import {
	createEvalSetResult,
	sanitizeEvalSetResultName,
} from "../../evaluation/eval-set-results-manager-utils";

/**
 * Leftover: sanitizeEvalSetResultName only replaces `/` — backslash and other
 * path-like separators are preserved (schema id sanitization residual).
 */
describe("eval-set-results sanitize backslash ninth leftover edges", () => {
	it.each([
		["a\\b", "a\\b"],
		["a\\\\b", "a\\\\b"],
		["\\leading", "\\leading"],
		["trail\\", "trail\\"],
		["mix/and\\slash", "mix_and\\slash"],
	] as const)("sanitizeEvalSetResultName(%j) → %j", (input, expected) => {
		expect(sanitizeEvalSetResultName(input)).toBe(expected);
	});

	it("still replaces forward slashes (control)", () => {
		expect(sanitizeEvalSetResultName("a/b/c")).toBe("a_b_c");
	});

	it("createEvalSetResult name keeps backslash from appName", () => {
		const result = createEvalSetResult("app\\name", "set", []);
		expect(result.evalSetResultId).toContain("app\\name_set_");
		expect(result.evalSetResultName).toBe(
			sanitizeEvalSetResultName(result.evalSetResultId),
		);
		expect(result.evalSetResultName).toContain("\\");
		expect(result.evalSetResultName).not.toContain("/");
	});
});
