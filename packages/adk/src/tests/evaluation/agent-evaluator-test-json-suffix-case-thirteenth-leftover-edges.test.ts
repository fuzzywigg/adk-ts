import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentEvaluator } from "../../evaluation/agent-evaluator";

/**
 * Thirteenth leftover: recursive discovery uses endsWith(".test.json") —
 * `.TEST.JSON` / `.test.JSON` are not collected.
 */
describe("agent-evaluator test.json suffix case thirteenth leftover", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "adk-eval-testjson-"));
	});

	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true });
	});

	it("finds lowercase .test.json and skips cased variants", async () => {
		await fs.writeFile(path.join(dir, "keep.test.json"), "[]");
		await fs.writeFile(path.join(dir, "skip.TEST.JSON"), "[]");
		await fs.writeFile(path.join(dir, "skip.test.JSON"), "[]");
		await fs.writeFile(path.join(dir, "skip.test.json.bak"), "[]");
		const nested = path.join(dir, "nested");
		await fs.mkdir(nested);
		await fs.writeFile(path.join(nested, "deep.test.json"), "[]");

		const found = await (AgentEvaluator as any)._findTestFilesRecursively(dir);
		const names = found.map((p: string) => path.basename(p)).sort();
		expect(names).toEqual(["deep.test.json", "keep.test.json"]);
	});
});
