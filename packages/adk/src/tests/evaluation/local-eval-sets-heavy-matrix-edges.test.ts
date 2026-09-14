import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EvalCase } from "../../evaluation/eval-case";
import type { EvalSet } from "../../evaluation/eval-set";
import { LocalEvalSetsManager } from "../../evaluation/local-eval-sets-manager";

function makeEvalSet(
	evalSetId: string,
	overrides: Partial<EvalSet> = {},
): EvalSet {
	return {
		evalSetId,
		name: overrides.name ?? evalSetId,
		description: overrides.description,
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

describe("LocalEvalSetsManager heavy matrix edges", () => {
	let basePath: string;
	let manager: LocalEvalSetsManager;
	const appName = "matrix-app";

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-eval-matrix-"));
		manager = new LocalEvalSetsManager(basePath);
	});

	afterEach(async () => {
		await fs.rm(basePath, { recursive: true, force: true });
	});

	describe("duplicate and missing set matrices", () => {
		it.each([
			"dup",
			"DUP",
			"dup-set",
			"set_1",
		])("throws on duplicate create for id %s", async (id) => {
			await manager.createEvalSet(appName, makeEvalSet(id));
			await expect(
				manager.createEvalSet(appName, makeEvalSet(id)),
			).rejects.toThrow(/already exists/);
		});

		it.each([
			"ghost",
			"missing-set",
			"nope",
		])("throws when deleting missing set %s", async (id) => {
			await expect(manager.deleteEvalSet(appName, id)).rejects.toThrow(
				/not found/,
			);
		});

		it.each([
			"ghost",
			"absent",
		])("throws when updating missing set %s", async (id) => {
			await expect(
				manager.updateEvalSet(appName, makeEvalSet(id)),
			).rejects.toThrow(/not found/);
		});

		it("getEvalSet returns undefined for missing ids across apps", async () => {
			expect(await manager.getEvalSet(appName, "missing")).toBeUndefined();
			expect(await manager.getEvalSet("other-app", "missing")).toBeUndefined();
		});

		it("createEvalCase fails when set is missing", async () => {
			await expect(
				manager.createEvalCase(appName, "no-set", makeCase("c1")),
			).rejects.toThrow(/not found/);
		});

		it("updateEvalCase fails when set is missing", async () => {
			await expect(
				manager.updateEvalCase(appName, "no-set", makeCase("c1")),
			).rejects.toThrow(/not found/);
		});

		it("deleteEvalCase fails when set is missing", async () => {
			await expect(
				manager.deleteEvalCase(appName, "no-set", "c1"),
			).rejects.toThrow(/not found/);
		});

		it("throws on duplicate eval case ids", async () => {
			await manager.createEvalSet(appName, makeEvalSet("set-1"));
			await manager.createEvalCase(appName, "set-1", makeCase("case-1"));
			await expect(
				manager.createEvalCase(appName, "set-1", makeCase("case-1")),
			).rejects.toThrow(/already exists/);
		});

		it("throws when deleting a missing eval case", async () => {
			await manager.createEvalSet(appName, makeEvalSet("set-1"));
			await expect(
				manager.deleteEvalCase(appName, "set-1", "ghost-case"),
			).rejects.toThrow(/not found/);
		});

		it("throws when updating a missing eval case", async () => {
			await manager.createEvalSet(appName, makeEvalSet("set-1"));
			await expect(
				manager.updateEvalCase(appName, "set-1", makeCase("ghost-case")),
			).rejects.toThrow(/not found/);
		});
	});

	describe("unicode ids and empty conversation matrices", () => {
		it.each([
			"セット-日本語",
			"набор-кириллица",
			"مجموعة",
			"set-🚀-emoji",
			"set with spaces",
			"set.dotty",
		])("creates and fetches unicode/special set id %s", async (id) => {
			await manager.createEvalSet(
				appName,
				makeEvalSet(id, { description: `desc-${id}` }),
			);
			const fetched = await manager.getEvalSet(appName, id);
			expect(fetched?.evalSetId).toBe(id);
			expect(fetched?.description).toBe(`desc-${id}`);
			await manager.deleteEvalSet(appName, id);
			expect(await manager.getEvalSet(appName, id)).toBeUndefined();
		});

		it.each([
			"ケース-1",
			"case-üñîçødé",
			"case-🔥",
		])("persists unicode case id %s with empty conversation", async (caseId) => {
			await manager.createEvalSet(appName, makeEvalSet("unicode-set"));
			await manager.createEvalCase(
				appName,
				"unicode-set",
				makeCase(caseId, { conversation: [] }),
			);
			const fetched = await manager.getEvalCase(appName, "unicode-set", caseId);
			expect(fetched?.evalId).toBe(caseId);
			expect(fetched?.conversation).toEqual([]);
		});

		it("stores empty conversation arrays without inventing turns", async () => {
			await manager.createEvalSet(
				appName,
				makeEvalSet("empty-convo", {
					evalCases: [makeCase("empty", { conversation: [] })],
				}),
			);
			const fetched = await manager.getEvalCase(
				appName,
				"empty-convo",
				"empty",
			);
			expect(fetched?.conversation).toEqual([]);
			expect(fetched?.sessionInput).toBeUndefined();
		});

		it("round-trips empty conversation after update", async () => {
			await manager.createEvalSet(appName, makeEvalSet("set-1"));
			await manager.createEvalCase(
				appName,
				"set-1",
				makeCase("c1", {
					conversation: [
						{
							userContent: { parts: [{ text: "hi" }] },
							creationTimestamp: 1,
						},
					],
				}),
			);
			await manager.updateEvalCase(
				appName,
				"set-1",
				makeCase("c1", { conversation: [] }),
			);
			expect(
				(await manager.getEvalCase(appName, "set-1", "c1"))?.conversation,
			).toEqual([]);
		});
	});

	describe("corrupt JSON and file recovery edges", () => {
		it("getEvalSet rethrows SyntaxError for corrupt JSON files", async () => {
			const evalSetsPath = path.join(basePath, appName, "eval_sets");
			await fs.mkdir(evalSetsPath, { recursive: true });
			await fs.writeFile(
				path.join(evalSetsPath, "corrupt.json"),
				"{ not-valid-json",
			);
			await expect(manager.getEvalSet(appName, "corrupt")).rejects.toThrow();
		});

		it("listEvalSets rethrows when a .json file is corrupt", async () => {
			await manager.createEvalSet(appName, makeEvalSet("good"));
			const evalSetsPath = path.join(basePath, appName, "eval_sets");
			await fs.writeFile(path.join(evalSetsPath, "bad.json"), "[[[");
			await expect(manager.listEvalSets(appName)).rejects.toThrow();
		});

		it("recover by overwriting corrupt file via create after delete path rewrite", async () => {
			const evalSetsPath = path.join(basePath, appName, "eval_sets");
			await fs.mkdir(evalSetsPath, { recursive: true });
			const corruptPath = path.join(evalSetsPath, "recover.json");
			await fs.writeFile(corruptPath, "{broken");
			await fs.unlink(corruptPath);
			const created = await manager.createEvalSet(
				appName,
				makeEvalSet("recover", { description: "fixed" }),
			);
			expect(created.description).toBe("fixed");
			expect((await manager.getEvalSet(appName, "recover"))?.description).toBe(
				"fixed",
			);
		});

		it("listEvalSets skips non-json siblings while keeping valid sets", async () => {
			await manager.createEvalSet(appName, makeEvalSet("keep"));
			const evalSetsPath = path.join(basePath, appName, "eval_sets");
			await fs.writeFile(path.join(evalSetsPath, "notes.txt"), "ignore");
			await fs.writeFile(path.join(evalSetsPath, "readme.md"), "# ignore");
			await fs.writeFile(
				path.join(evalSetsPath, "also.json.bak"),
				JSON.stringify(makeEvalSet("bak")),
			);
			const listed = await manager.listEvalSets(appName);
			expect(listed.map((s) => s.evalSetId)).toEqual(["keep"]);
		});

		it("listEvalSets returns empty for apps with no directory yet", async () => {
			expect(await manager.listEvalSets("never-touched")).toEqual([]);
		});
	});

	describe("multi-case and multi-set matrices", () => {
		it("lists many independently created sets sorted by filesystem order", async () => {
			for (const id of ["z", "a", "m"]) {
				await manager.createEvalSet(appName, makeEvalSet(id));
			}
			const ids = (await manager.listEvalSets(appName))
				.map((s) => s.evalSetId)
				.sort();
			expect(ids).toEqual(["a", "m", "z"]);
		});

		it("deleteEvalCase leaves sibling cases intact across unicode ids", async () => {
			await manager.createEvalSet(
				appName,
				makeEvalSet("set-1", {
					evalCases: [
						makeCase("keep-α"),
						makeCase("drop-β"),
						makeCase("keep-γ"),
					],
				}),
			);
			await manager.deleteEvalCase(appName, "set-1", "drop-β");
			const fetched = await manager.getEvalSet(appName, "set-1");
			expect(fetched?.evalCases.map((c) => c.evalId)).toEqual([
				"keep-α",
				"keep-γ",
			]);
		});

		it("getEvalCase returns undefined for unknown case in populated set", async () => {
			await manager.createEvalSet(
				appName,
				makeEvalSet("set-1", { evalCases: [makeCase("only")] }),
			);
			expect(
				await manager.getEvalCase(appName, "set-1", "other"),
			).toBeUndefined();
		});

		it("persists sessionInput with empty state object", async () => {
			await manager.createEvalSet(appName, makeEvalSet("set-1"));
			await manager.createEvalCase(
				appName,
				"set-1",
				makeCase("c1", {
					sessionInput: { appName: "app", userId: "u", state: {} },
					conversation: [],
				}),
			);
			const fetched = await manager.getEvalCase(appName, "set-1", "c1");
			expect(fetched?.sessionInput?.state).toEqual({});
			expect(fetched?.conversation).toEqual([]);
		});

		it("updateEvalSet replaces description while preserving cases", async () => {
			await manager.createEvalSet(
				appName,
				makeEvalSet("set-1", {
					description: "old",
					evalCases: [makeCase("c1")],
				}),
			);
			await manager.updateEvalSet(
				appName,
				makeEvalSet("set-1", {
					description: "new",
					evalCases: [makeCase("c1"), makeCase("c2")],
					creationTimestamp: 99,
				}),
			);
			const fetched = await manager.getEvalSet(appName, "set-1");
			expect(fetched?.description).toBe("new");
			expect(fetched?.creationTimestamp).toBe(99);
			expect(fetched?.evalCases.map((c) => c.evalId)).toEqual(["c1", "c2"]);
		});
	});
});
