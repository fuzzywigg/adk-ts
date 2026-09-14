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

function makeEvalSet(
	overrides: Partial<EvalSet> & { evalSetId?: string } = {},
): EvalSet {
	return {
		evalSetId: overrides.evalSetId ?? "set-1",
		evalCases: overrides.evalCases ?? [],
		creationTimestamp: overrides.creationTimestamp ?? 1,
	};
}

function makeCase(evalId: string, overrides: Partial<EvalCase> = {}): EvalCase {
	return {
		evalId,
		conversation: overrides.conversation ?? [],
		sessionInput: overrides.sessionInput,
	};
}

describe("eval-sets-manager-utils leftover edges", () => {
	describe("getEvalSetFromAppAndId throw arms", () => {
		it("throws Eval set `id` not found when manager returns undefined", async () => {
			const manager = {
				getEvalSet: async () => undefined,
			};
			await expect(
				getEvalSetFromAppAndId(manager as never, "app", "missing"),
			).rejects.toThrow("Eval set `missing` not found.");
		});

		it("throws for empty string evalSetId", async () => {
			const manager = {
				getEvalSet: async () => undefined,
			};
			await expect(
				getEvalSetFromAppAndId(manager as never, "app", ""),
			).rejects.toThrow("Eval set `` not found.");
		});

		it("returns eval set when manager resolves it", async () => {
			const evalSet = makeEvalSet({ evalSetId: "found" });
			const manager = {
				getEvalSet: async () => evalSet,
			};
			await expect(
				getEvalSetFromAppAndId(manager as never, "app", "found"),
			).resolves.toBe(evalSet);
		});
	});

	describe("getEvalCaseFromEvalSet on empty evalCases", () => {
		it("returns undefined when evalCases is empty", () => {
			const evalSet = makeEvalSet({ evalCases: [] });
			expect(getEvalCaseFromEvalSet(evalSet, "any")).toBeUndefined();
		});

		it("returns undefined for missing id in non-empty set", () => {
			const evalSet = makeEvalSet({ evalCases: [makeCase("a")] });
			expect(getEvalCaseFromEvalSet(evalSet, "b")).toBeUndefined();
		});

		it("finds case by exact evalId match", () => {
			const caseB = makeCase("b");
			const evalSet = makeEvalSet({
				evalCases: [makeCase("a"), caseB],
			});
			expect(getEvalCaseFromEvalSet(evalSet, "b")).toBe(caseB);
		});
	});

	describe("addEvalCaseToEvalSet throw arms", () => {
		it("throws already exists when evalId duplicates in set", () => {
			const evalSet = makeEvalSet({ evalCases: [makeCase("dup")] });
			expect(() => addEvalCaseToEvalSet(evalSet, makeCase("dup"))).toThrow(
				"Eval id `dup` already exists in `set-1` eval set.",
			);
		});

		it("appends to empty evalCases array", () => {
			const evalSet = makeEvalSet({ evalCases: [] });
			addEvalCaseToEvalSet(evalSet, makeCase("first"));
			expect(evalSet.evalCases.map((c) => c.evalId)).toEqual(["first"]);
		});

		it("mutates evalSet in place and returns same reference", () => {
			const evalSet = makeEvalSet();
			const returned = addEvalCaseToEvalSet(evalSet, makeCase("new"));
			expect(returned).toBe(evalSet);
			expect(evalSet.evalCases).toHaveLength(1);
		});
	});

	describe("updateEvalCaseInEvalSet throw arms", () => {
		it("throws not found when case id is missing from set", () => {
			const evalSet = makeEvalSet({ evalCases: [makeCase("a")] });
			expect(() =>
				updateEvalCaseInEvalSet(evalSet, makeCase("missing")),
			).toThrow("Eval case `missing` not found in eval set `set-1`.");
		});

		it("throws not found on empty evalCases", () => {
			const evalSet = makeEvalSet({ evalCases: [] });
			expect(() => updateEvalCaseInEvalSet(evalSet, makeCase("x"))).toThrow(
				/not found/,
			);
		});

		it("replaces existing case at end of array", () => {
			const evalSet = makeEvalSet({
				evalCases: [makeCase("a"), makeCase("b")],
			});
			const updated = makeCase("a", {
				conversation: [
					{
						userContent: { parts: [{ text: "updated" }] },
						creationTimestamp: 2,
					},
				],
			});
			updateEvalCaseInEvalSet(evalSet, updated);
			expect(evalSet.evalCases).toHaveLength(2);
			expect(evalSet.evalCases[1].evalId).toBe("a");
			expect(
				evalSet.evalCases[1].conversation[0].userContent.parts?.[0].text,
			).toBe("updated");
		});
	});

	describe("deleteEvalCaseFromEvalSet throw arms", () => {
		it("throws not found when deleting from empty evalCases", () => {
			const evalSet = makeEvalSet({ evalCases: [] });
			expect(() => deleteEvalCaseFromEvalSet(evalSet, "x")).toThrow(
				"Eval case `x` not found in eval set `set-1`.",
			);
		});

		it("throws not found when id does not exist", () => {
			const evalSet = makeEvalSet({ evalCases: [makeCase("keep")] });
			expect(() => deleteEvalCaseFromEvalSet(evalSet, "drop")).toThrow(
				"Eval case `drop` not found in eval set `set-1`.",
			);
		});

		it("removes only the targeted case and preserves siblings", () => {
			const evalSet = makeEvalSet({
				evalCases: [makeCase("keep"), makeCase("drop"), makeCase("also")],
			});
			deleteEvalCaseFromEvalSet(evalSet, "drop");
			expect(evalSet.evalCases.map((c) => c.evalId)).toEqual(["keep", "also"]);
		});

		it("mutates evalSet in place and returns same reference", () => {
			const evalSet = makeEvalSet({ evalCases: [makeCase("a")] });
			const returned = deleteEvalCaseFromEvalSet(evalSet, "a");
			expect(returned).toBe(evalSet);
			expect(evalSet.evalCases).toEqual([]);
		});
	});

	describe("error message includes evalSetId from eval set", () => {
		it("uses custom evalSetId in add duplicate error", () => {
			const evalSet = makeEvalSet({
				evalSetId: "custom-set",
				evalCases: [makeCase("x")],
			});
			expect(() => addEvalCaseToEvalSet(evalSet, makeCase("x"))).toThrow(
				"Eval id `x` already exists in `custom-set` eval set.",
			);
		});

		it("uses custom evalSetId in update not found error", () => {
			const evalSet = makeEvalSet({ evalSetId: "custom-set" });
			expect(() => updateEvalCaseInEvalSet(evalSet, makeCase("y"))).toThrow(
				"Eval case `y` not found in eval set `custom-set`.",
			);
		});

		it("uses custom evalSetId in delete not found error", () => {
			const evalSet = makeEvalSet({ evalSetId: "custom-set" });
			expect(() => deleteEvalCaseFromEvalSet(evalSet, "z")).toThrow(
				"Eval case `z` not found in eval set `custom-set`.",
			);
		});
	});
});
