import { describe, expect, it } from "vitest";
import {
	createEvalSetResult,
	sanitizeEvalSetResultName,
} from "../../evaluation/eval-set-results-manager-utils";

/**
 * Thirteenth leftover: sanitizeEvalSetResultName only swaps `/` (global).
 * Empty string stays empty; consecutive slashes become consecutive underscores.
 */
describe("eval-set-results sanitize empty/slash thirteenth leftover", () => {
	it("empty string stays empty", () => {
		expect(sanitizeEvalSetResultName("")).toBe("");
	});

	it("consecutive slashes become consecutive underscores", () => {
		expect(sanitizeEvalSetResultName("a//b///c")).toBe("a__b___c");
	});

	it("leading/trailing slashes become underscores", () => {
		expect(sanitizeEvalSetResultName("/a/")).toBe("_a_");
	});

	it("createEvalSetResult still sanitizes slashes in appName", () => {
		const result = createEvalSetResult("app/name", "set", []);
		expect(result.evalSetResultName).not.toContain("/");
		expect(result.evalSetResultName).toContain("app_name_set_");
	});
});
