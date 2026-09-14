import { describe, expect, it } from "vitest";
import type { EvalCase } from "../../evaluation/eval-case";
import type { EvalSet } from "../../evaluation/eval-set";
import {
	deleteEvalCaseFromEvalSet,
	updateEvalCaseInEvalSet,
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

function makeCase(evalId: string, extra?: Partial<EvalCase>): EvalCase {
	return {
		evalId,
		conversation: [],
		...extra,
	};
}

/**
 * Leftover: eighth leftover covered get/add case sensitivity; update/delete
 * share the same === path and were unasserted for Case vs case.
 */
describe("eval-sets update/delete evalid case ninth leftover edges", () => {
	it("updateEvalCaseInEvalSet throws on differently-cased id", () => {
		const evalSet = makeEvalSet({ evalCases: [makeCase("Case")] });
		expect(() => updateEvalCaseInEvalSet(evalSet, makeCase("case"))).toThrow(
			/not found/,
		);
		expect(() => updateEvalCaseInEvalSet(evalSet, makeCase("CASE"))).toThrow(
			/not found/,
		);
		expect(evalSet.evalCases.map((c) => c.evalId)).toEqual(["Case"]);
	});

	it("updateEvalCaseInEvalSet succeeds on exact case (control)", () => {
		const evalSet = makeEvalSet({
			evalCases: [makeCase("Case", { sessionInput: undefined })],
		});
		const updated = makeCase("Case", {
			sessionInput: { appName: "a", userId: "u", state: { x: 1 } },
		});
		updateEvalCaseInEvalSet(evalSet, updated);
		expect(evalSet.evalCases).toHaveLength(1);
		expect(evalSet.evalCases[0].sessionInput?.state).toEqual({ x: 1 });
	});

	it("deleteEvalCaseFromEvalSet throws on differently-cased id", () => {
		const evalSet = makeEvalSet({ evalCases: [makeCase("Case")] });
		expect(() => deleteEvalCaseFromEvalSet(evalSet, "case")).toThrow(
			/not found/,
		);
		expect(() => deleteEvalCaseFromEvalSet(evalSet, "CASE")).toThrow(
			/not found/,
		);
		expect(evalSet.evalCases.map((c) => c.evalId)).toEqual(["Case"]);
	});

	it("deleteEvalCaseFromEvalSet succeeds on exact case (control)", () => {
		const evalSet = makeEvalSet({
			evalCases: [makeCase("Case"), makeCase("other")],
		});
		deleteEvalCaseFromEvalSet(evalSet, "Case");
		expect(evalSet.evalCases.map((c) => c.evalId)).toEqual(["other"]);
	});
});
