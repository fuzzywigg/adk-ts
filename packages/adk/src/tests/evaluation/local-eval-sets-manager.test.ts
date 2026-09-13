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

describe("LocalEvalSetsManager", () => {
	let basePath: string;
	let manager: LocalEvalSetsManager;
	const appName = "test-app";

	beforeEach(async () => {
		basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-eval-sets-"));
		manager = new LocalEvalSetsManager(basePath);
	});

	afterEach(async () => {
		await fs.rm(basePath, { recursive: true, force: true });
	});

	it("creates, lists, gets, updates, and deletes eval sets", async () => {
		const created = await manager.createEvalSet(
			appName,
			makeEvalSet("set-1", { description: "first" }),
		);
		expect(created.evalSetId).toBe("set-1");

		const listed = await manager.listEvalSets(appName);
		expect(listed.map((s) => s.evalSetId)).toEqual(["set-1"]);

		const fetched = await manager.getEvalSet(appName, "set-1");
		expect(fetched?.description).toBe("first");

		const updated = await manager.updateEvalSet(
			appName,
			makeEvalSet("set-1", { description: "updated", creationTimestamp: 2 }),
		);
		expect(updated.description).toBe("updated");
		expect((await manager.getEvalSet(appName, "set-1"))?.description).toBe(
			"updated",
		);

		await manager.deleteEvalSet(appName, "set-1");
		expect(await manager.getEvalSet(appName, "set-1")).toBeUndefined();
		expect(await manager.listEvalSets(appName)).toEqual([]);
	});

	it("throws when creating a duplicate eval set", async () => {
		await manager.createEvalSet(appName, makeEvalSet("dup"));
		await expect(
			manager.createEvalSet(appName, makeEvalSet("dup")),
		).rejects.toThrow(/already exists/);
	});

	it("throws when deleting a missing eval set", async () => {
		await expect(manager.deleteEvalSet(appName, "missing")).rejects.toThrow(
			/not found/,
		);
	});

	it("creates, gets, updates, and deletes eval cases", async () => {
		await manager.createEvalSet(appName, makeEvalSet("set-1"));

		const createdCase = await manager.createEvalCase(
			appName,
			"set-1",
			makeCase("case-1", {
				conversation: [
					{
						userContent: { parts: [{ text: "hello" }] },
						creationTimestamp: 1,
					},
				],
			}),
		);
		expect(createdCase.evalId).toBe("case-1");

		const fetched = await manager.getEvalCase(appName, "set-1", "case-1");
		expect(fetched?.conversation).toHaveLength(1);

		const updated = await manager.updateEvalCase(
			appName,
			"set-1",
			makeCase("case-1", {
				conversation: [
					{
						userContent: { parts: [{ text: "updated" }] },
						creationTimestamp: 2,
					},
				],
			}),
		);
		expect(updated.conversation[0].userContent.parts?.[0].text).toBe("updated");

		await manager.deleteEvalCase(appName, "set-1", "case-1");
		expect(
			await manager.getEvalCase(appName, "set-1", "case-1"),
		).toBeUndefined();
	});

	it("throws when creating a duplicate eval case", async () => {
		await manager.createEvalSet(appName, makeEvalSet("set-1"));
		await manager.createEvalCase(appName, "set-1", makeCase("case-1"));

		await expect(
			manager.createEvalCase(appName, "set-1", makeCase("case-1")),
		).rejects.toThrow(/already exists/);
	});

	it("throws when deleting a missing eval case", async () => {
		await manager.createEvalSet(appName, makeEvalSet("set-1"));
		await expect(
			manager.deleteEvalCase(appName, "set-1", "missing"),
		).rejects.toThrow(/not found/);
	});
});
