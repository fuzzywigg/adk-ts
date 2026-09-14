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

function makeCase(evalId: string): EvalCase {
	return { evalId, conversation: [] };
}

describe("LocalEvalSetsManager leftover edges", () => {
	let basePath: string;
	let manager: LocalEvalSetsManager;
	const appName = "edge-app";

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-eval-edges-"));
		manager = new LocalEvalSetsManager(basePath);
	});

	afterEach(async () => {
		await fs.rm(basePath, { recursive: true, force: true });
	});

	describe("non-.json file skip in listEvalSets", () => {
		it("skips .txt files", async () => {
			await manager.createEvalSet(appName, makeEvalSet("valid"));
			const dir = path.join(basePath, appName, "eval_sets");
			await fs.writeFile(path.join(dir, "readme.txt"), "ignore me");
			const listed = await manager.listEvalSets(appName);
			expect(listed.map((s) => s.evalSetId)).toEqual(["valid"]);
		});

		it("skips .json.bak and .JSON uppercase extension variants that do not end with .json", async () => {
			await manager.createEvalSet(appName, makeEvalSet("valid"));
			const dir = path.join(basePath, appName, "eval_sets");
			await fs.writeFile(
				path.join(dir, "backup.json.bak"),
				JSON.stringify(makeEvalSet("bak")),
			);
			await fs.writeFile(path.join(dir, "notes.md"), "# notes");
			const listed = await manager.listEvalSets(appName);
			expect(listed).toHaveLength(1);
			expect(listed[0].evalSetId).toBe("valid");
		});

		it("includes files ending exactly with .json", async () => {
			await manager.createEvalSet(appName, makeEvalSet("set-a"));
			await manager.createEvalSet(appName, makeEvalSet("set-b"));
			const listed = await manager.listEvalSets(appName);
			expect(listed.map((s) => s.evalSetId).sort()).toEqual(["set-a", "set-b"]);
		});

		it("does not include hidden files without .json suffix", async () => {
			await manager.createEvalSet(appName, makeEvalSet("visible"));
			const dir = path.join(basePath, appName, "eval_sets");
			await fs.writeFile(path.join(dir, ".hidden"), "{}");
			const listed = await manager.listEvalSets(appName);
			expect(listed).toHaveLength(1);
		});
	});

	describe("corrupt JSON handling", () => {
		it("throws when listEvalSets encounters invalid JSON in a .json file", async () => {
			const dir = path.join(basePath, appName, "eval_sets");
			await fs.mkdir(dir, { recursive: true });
			await fs.writeFile(path.join(dir, "broken.json"), "{ not valid json");
			await expect(manager.listEvalSets(appName)).rejects.toThrow();
		});

		it("throws when getEvalSet reads corrupt JSON", async () => {
			const dir = path.join(basePath, appName, "eval_sets");
			await fs.mkdir(dir, { recursive: true });
			await fs.writeFile(path.join(dir, "corrupt.json"), "[]][][]");
			await expect(manager.getEvalSet(appName, "corrupt")).rejects.toThrow();
		});

		it("returns undefined for missing eval set file (ENOENT)", async () => {
			expect(await manager.getEvalSet(appName, "ghost")).toBeUndefined();
		});
	});

	describe("missing set update/delete error strings", () => {
		it("updateEvalSet throws Eval set `id` not found when set is missing", async () => {
			await expect(
				manager.updateEvalSet(appName, makeEvalSet("missing-set")),
			).rejects.toThrow("Eval set `missing-set` not found.");
		});

		it("deleteEvalSet throws Eval set `id` not found for app when file missing", async () => {
			await expect(manager.deleteEvalSet(appName, "ghost-set")).rejects.toThrow(
				"Eval set `ghost-set` not found for app `edge-app`.",
			);
		});

		it("createEvalCase throws when parent eval set is missing", async () => {
			await expect(
				manager.createEvalCase(appName, "no-set", makeCase("c1")),
			).rejects.toThrow("Eval set `no-set` not found.");
		});

		it("updateEvalCase throws when parent eval set is missing", async () => {
			await expect(
				manager.updateEvalCase(appName, "no-set", makeCase("c1")),
			).rejects.toThrow("Eval set `no-set` not found.");
		});

		it("deleteEvalCase throws when parent eval set is missing", async () => {
			await expect(
				manager.deleteEvalCase(appName, "no-set", "c1"),
			).rejects.toThrow("Eval set `no-set` not found.");
		});

		it("getEvalCase throws when parent eval set is missing", async () => {
			await expect(
				manager.getEvalCase(appName, "no-set", "c1"),
			).rejects.toThrow("Eval set `no-set` not found.");
		});
	});

	describe("case operations on existing sets", () => {
		it("deleteEvalCase throws Eval case `id` not found when case missing", async () => {
			await manager.createEvalSet(appName, makeEvalSet("set-1"));
			await expect(
				manager.deleteEvalCase(appName, "set-1", "ghost-case"),
			).rejects.toThrow(
				"Eval case `ghost-case` not found in eval set `set-1`.",
			);
		});

		it("updateEvalCase throws Eval case `id` not found when case missing", async () => {
			await manager.createEvalSet(appName, makeEvalSet("set-1"));
			await expect(
				manager.updateEvalCase(appName, "set-1", makeCase("ghost")),
			).rejects.toThrow("Eval case `ghost` not found in eval set `set-1`.");
		});

		it("createEvalCase throws Eval id already exists on duplicate", async () => {
			await manager.createEvalSet(
				appName,
				makeEvalSet("set-1", { evalCases: [makeCase("dup")] }),
			);
			await expect(
				manager.createEvalCase(appName, "set-1", makeCase("dup")),
			).rejects.toThrow("Eval id `dup` already exists in `set-1` eval set.");
		});
	});

	describe("createEvalSet duplicate guard", () => {
		it("throws already exists message with app name", async () => {
			await manager.createEvalSet(appName, makeEvalSet("dup"));
			await expect(
				manager.createEvalSet(appName, makeEvalSet("dup")),
			).rejects.toThrow("Eval set `dup` already exists for app `edge-app`.");
		});
	});

	describe("listEvalSets empty directory bootstrap", () => {
		it("returns empty array for brand-new app without eval_sets dir", async () => {
			const listed = await manager.listEvalSets("brand-new");
			expect(listed).toEqual([]);
			const dirExists = await fs
				.access(path.join(basePath, "brand-new", "eval_sets"))
				.then(() => true)
				.catch(() => false);
			expect(dirExists).toBe(true);
		});
	});

	describe("persistence round-trip", () => {
		it("getEvalSet returns parsed JSON matching written content", async () => {
			const set = makeEvalSet("persist", {
				description: "saved",
				evalCases: [makeCase("c1")],
			});
			await manager.createEvalSet(appName, set);
			const fetched = await manager.getEvalSet(appName, "persist");
			expect(fetched?.description).toBe("saved");
			expect(fetched?.evalCases[0].evalId).toBe("c1");
		});

		it("deleteEvalSet removes file so subsequent get returns undefined", async () => {
			await manager.createEvalSet(appName, makeEvalSet("temp"));
			await manager.deleteEvalSet(appName, "temp");
			expect(await manager.getEvalSet(appName, "temp")).toBeUndefined();
		});
	});
});
