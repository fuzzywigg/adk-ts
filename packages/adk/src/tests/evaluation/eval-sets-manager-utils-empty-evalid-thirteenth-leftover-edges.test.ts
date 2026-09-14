import { describe, expect, it } from "vitest";
import type { EvalCase } from "../../evaluation/eval-case";
import type { EvalSet } from "../../evaluation/eval-set";
import {
	addEvalCaseToEvalSet,
	deleteEvalCaseFromEvalSet,
	getEvalCaseFromEvalSet,
	updateEvalCaseInEvalSet,
} from "../../evaluation/eval-sets-manager-utils";

function makeEvalSet(evalCases: EvalCase[] = []): EvalSet {
	return {
		evalSetId: "set-1",
		evalCases,
		creationTimestamp: 1,
	};
}

function makeCase(evalId: string): EvalCase {
	return { evalId, conversation: [] };
}

/**
 * Thirteenth leftover: evalId identity is === including empty string — "" is a
 * real id, distinct from whitespace/"0".
 */
describe("eval-sets-manager-utils empty evalId thirteenth leftover", () => {
	it("get/add/update/delete treat empty string as a real evalId", () => {
		const evalSet = makeEvalSet([makeCase("")]);
		expect(getEvalCaseFromEvalSet(evalSet, "")?.evalId).toBe("");
		expect(getEvalCaseFromEvalSet(evalSet, " ")).toBeUndefined();
		expect(() => addEvalCaseToEvalSet(evalSet, makeCase(""))).toThrow(
			/already exists/,
		);
		const updated = updateEvalCaseInEvalSet(evalSet, {
			evalId: "",
			conversation: [
				{ userContent: { role: "user", parts: [] }, creationTimestamp: 1 },
			],
		});
		expect(updated.evalCases[0].conversation).toHaveLength(1);
		deleteEvalCaseFromEvalSet(evalSet, "");
		expect(evalSet.evalCases).toEqual([]);
	});

	it('treats "0" and 0-as-string as distinct from empty', () => {
		const evalSet = makeEvalSet([makeCase("0")]);
		expect(getEvalCaseFromEvalSet(evalSet, "")).toBeUndefined();
		expect(getEvalCaseFromEvalSet(evalSet, "0")?.evalId).toBe("0");
	});
});
