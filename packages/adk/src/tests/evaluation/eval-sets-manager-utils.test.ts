import { describe, expect, it } from "vitest";
import type { EvalCase } from "../../evaluation/eval-case";
import type { EvalSet } from "../../evaluation/eval-set";
import {
	addEvalCaseToEvalSet,
	deleteEvalCaseFromEvalSet,
	getEvalCaseFromEvalSet,
	getEvalSetFromAppAndId,
	updateEvalCaseInEvalSet,
} from "../../evaluation/eval-sets-manager-utils";

function makeEvalSet(cases: EvalCase[] = []): EvalSet {
	return {
		evalSetId: "set-1",
		evalCases: cases,
		creationTimestamp: 1,
	};
}

function makeCase(evalId: string): EvalCase {
	return {
		evalId,
		conversation: [],
	};
}

describe("eval-sets-manager-utils", () => {
	it("finds eval cases by id", () => {
		const evalSet = makeEvalSet([makeCase("a"), makeCase("b")]);
		expect(getEvalCaseFromEvalSet(evalSet, "b")?.evalId).toBe("b");
		expect(getEvalCaseFromEvalSet(evalSet, "missing")).toBeUndefined();
	});

	it("adds eval cases and rejects duplicates", () => {
		const evalSet = makeEvalSet([makeCase("a")]);
		addEvalCaseToEvalSet(evalSet, makeCase("b"));
		expect(evalSet.evalCases.map((c) => c.evalId)).toEqual(["a", "b"]);

		expect(() => addEvalCaseToEvalSet(evalSet, makeCase("a"))).toThrow(
			/already exists/,
		);
	});

	it("updates existing eval cases and rejects missing ids", () => {
		const evalSet = makeEvalSet([makeCase("a")]);
		const updated: EvalCase = {
			evalId: "a",
			conversation: [
				{
					userContent: { parts: [{ text: "hi" }] },
					creationTimestamp: 1,
				},
			],
		};

		updateEvalCaseInEvalSet(evalSet, updated);
		expect(evalSet.evalCases).toHaveLength(1);
		expect(evalSet.evalCases[0].conversation).toHaveLength(1);

		expect(() => updateEvalCaseInEvalSet(evalSet, makeCase("missing"))).toThrow(
			/not found/,
		);
	});

	it("deletes eval cases and rejects missing ids", () => {
		const evalSet = makeEvalSet([makeCase("a"), makeCase("b")]);
		deleteEvalCaseFromEvalSet(evalSet, "a");
		expect(evalSet.evalCases.map((c) => c.evalId)).toEqual(["b"]);

		expect(() => deleteEvalCaseFromEvalSet(evalSet, "a")).toThrow(/not found/);
	});

	it("resolves eval sets from manager or throws when missing", async () => {
		const evalSet = makeEvalSet([makeCase("a")]);
		const manager = {
			getEvalSet: async (_app: string, id: string) =>
				id === "set-1" ? evalSet : undefined,
		};

		await expect(
			getEvalSetFromAppAndId(manager as never, "app", "set-1"),
		).resolves.toBe(evalSet);
		await expect(
			getEvalSetFromAppAndId(manager as never, "app", "missing"),
		).rejects.toThrow(/Eval set `missing` not found/);
	});
});
