import { describe, expect, it } from "vitest";
import type { EvalCase } from "../../evaluation/eval-case";
import type { EvalSet } from "../../evaluation/eval-set";
import {
	addEvalCaseToEvalSet,
	getEvalCaseFromEvalSet,
} from "../../evaluation/eval-sets-manager-utils";

function makeEvalSet(
	overrides: Partial<EvalSet> & { evalSetId?: string } = {},
): EvalSet {
	return {
		evalSetId: overrides.evalSetId ?? "set-1",
		evalCases: overrides.evalCases ?? [],
		creationTimestamp: overrides.creationTimestamp ?? 1,
	};
}

function makeCase(evalId: string): EvalCase {
	return {
		evalId,
		conversation: [],
	};
}

/**
 * Leftover: evalId identity uses case-sensitive === — Case vs case are
 * distinct ids for get/add.
 */
describe("eval-sets-manager evalid case-sensitivity eighth leftover edges", () => {
	it("getEvalCaseFromEvalSet misses differently-cased ids", () => {
		const evalSet = makeEvalSet({ evalCases: [makeCase("Case")] });
		expect(getEvalCaseFromEvalSet(evalSet, "case")).toBeUndefined();
		expect(getEvalCaseFromEvalSet(evalSet, "CASE")).toBeUndefined();
		expect(getEvalCaseFromEvalSet(evalSet, "Case")?.evalId).toBe("Case");
	});

	it("addEvalCaseToEvalSet allows Case and case as distinct ids", () => {
		const evalSet = makeEvalSet({ evalCases: [makeCase("Case")] });
		const updated = addEvalCaseToEvalSet(evalSet, makeCase("case"));
		expect(updated.evalCases.map((c) => c.evalId)).toEqual(["Case", "case"]);
	});

	it("same-case duplicate still throws (control)", () => {
		const evalSet = makeEvalSet({ evalCases: [makeCase("Case")] });
		expect(() => addEvalCaseToEvalSet(evalSet, makeCase("Case"))).toThrow(
			/already exists/,
		);
	});
});
