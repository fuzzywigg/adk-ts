import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalEvalSetsManager } from "../../evaluation/local-eval-sets-manager";

/**
 * Thirteenth leftover: listEvalSets `file.endsWith(".json")` is case-sensitive
 * so `.JSON` / `.Json` files are skipped.
 */
describe("local-eval-sets json suffix case thirteenth leftover", () => {
	let basePath: string;
	let manager: LocalEvalSetsManager;

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-eval-json-case-"));
		manager = new LocalEvalSetsManager(basePath);
	});

	afterEach(async () => {
		await fs.rm(basePath, { recursive: true, force: true });
	});

	it("lists only lowercase .json files, skipping .JSON/.Json", async () => {
		const dir = path.join(basePath, "app", "eval_sets");
		await fs.mkdir(dir, { recursive: true });
		const payload = {
			evalSetId: "keep",
			evalCases: [],
			creationTimestamp: 1,
		};
		await fs.writeFile(path.join(dir, "keep.json"), JSON.stringify(payload));
		await fs.writeFile(
			path.join(dir, "skip.JSON"),
			JSON.stringify({ ...payload, evalSetId: "skip-upper" }),
		);
		await fs.writeFile(
			path.join(dir, "skip.Json"),
			JSON.stringify({ ...payload, evalSetId: "skip-mixed" }),
		);
		await fs.writeFile(path.join(dir, "notes.txt"), "nope");

		const listed = await manager.listEvalSets("app");
		expect(listed.map((s) => s.evalSetId)).toEqual(["keep"]);
	});
});
