import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	AgentEvaluator,
	DEFAULT_CRITERIA,
	RESPONSE_MATCH_SCORE_KEY,
	TOOL_TRAJECTORY_SCORE_KEY,
	loadJson,
} from "../../evaluation/agent-evaluator";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "adk-eval-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs
			.splice(0)
			.map((dir) => fs.rm(dir, { recursive: true, force: true })),
	);
});

describe("loadJson", () => {
	it("loads a JSON object from disk", async () => {
		const dir = await makeTempDir();
		const file = path.join(dir, "sample.json");
		await fs.writeFile(file, JSON.stringify({ a: 1, b: ["x"] }));

		await expect(loadJson(file)).resolves.toEqual({ a: 1, b: ["x"] });
	});

	it("fails with a descriptive error for missing files", async () => {
		await expect(loadJson("/tmp/adk-does-not-exist-xyz.json")).rejects.toThrow(
			/Failed to load JSON/,
		);
	});

	it("fails when file content is not valid JSON", async () => {
		const dir = await makeTempDir();
		const file = path.join(dir, "bad.json");
		await fs.writeFile(file, "{not-json");

		await expect(loadJson(file)).rejects.toThrow(/Failed to load JSON/);
	});
});

describe("AgentEvaluator.findConfigForTestFile", () => {
	it("returns criteria from test_config.json when present", async () => {
		const dir = await makeTempDir();
		const testFile = path.join(dir, "case.test.json");
		await fs.writeFile(testFile, "[]");
		await fs.writeFile(
			path.join(dir, "test_config.json"),
			JSON.stringify({
				criteria: {
					[RESPONSE_MATCH_SCORE_KEY]: 0.9,
					[TOOL_TRAJECTORY_SCORE_KEY]: 1,
				},
			}),
		);

		await expect(
			AgentEvaluator.findConfigForTestFile(testFile),
		).resolves.toEqual({
			[RESPONSE_MATCH_SCORE_KEY]: 0.9,
			[TOOL_TRAJECTORY_SCORE_KEY]: 1,
		});
	});

	it("falls back to DEFAULT_CRITERIA when config is missing", async () => {
		const dir = await makeTempDir();
		const testFile = path.join(dir, "case.test.json");
		await fs.writeFile(testFile, "[]");

		await expect(
			AgentEvaluator.findConfigForTestFile(testFile),
		).resolves.toEqual(DEFAULT_CRITERIA);
	});

	it("falls back to DEFAULT_CRITERIA when criteria key is missing", async () => {
		const dir = await makeTempDir();
		const testFile = path.join(dir, "case.test.json");
		await fs.writeFile(testFile, "[]");
		await fs.writeFile(
			path.join(dir, "test_config.json"),
			JSON.stringify({ notCriteria: true }),
		);

		await expect(
			AgentEvaluator.findConfigForTestFile(testFile),
		).resolves.toEqual(DEFAULT_CRITERIA);
	});
});

describe("AgentEvaluator.migrateEvalDataToNewSchema", () => {
	it("migrates old query/reference rows into EvalSet schema", async () => {
		const dir = await makeTempDir();
		const oldFile = path.join(dir, "old.test.json");
		const newFile = path.join(dir, "new.evalset.json");
		await fs.writeFile(
			oldFile,
			JSON.stringify([
				{
					query: "What is ADK?",
					reference: "Agent Development Kit",
					expected_tool_use: [{ name: "search", args: { q: "adk" } }],
				},
			]),
		);
		await fs.writeFile(
			path.join(dir, "test_config.json"),
			JSON.stringify({
				criteria: {
					[RESPONSE_MATCH_SCORE_KEY]: 0.8,
					[TOOL_TRAJECTORY_SCORE_KEY]: 1,
				},
			}),
		);

		await AgentEvaluator.migrateEvalDataToNewSchema(oldFile, newFile);

		const migrated = JSON.parse(await fs.readFile(newFile, "utf-8"));
		expect(migrated.evalSetId).toMatch(/^eval-set-/);
		expect(migrated.name).toBe(oldFile);
		expect(migrated.evalCases).toHaveLength(1);
		expect(
			migrated.evalCases[0].conversation[0].userContent.parts[0].text,
		).toBe("What is ADK?");
		expect(
			migrated.evalCases[0].conversation[0].finalResponse.parts[0].text,
		).toBe("Agent Development Kit");
		expect(
			migrated.evalCases[0].conversation[0].intermediateData.toolUses,
		).toEqual([{ name: "search", args: { q: "adk" } }]);
	});

	it("rejects empty file paths", async () => {
		await expect(
			AgentEvaluator.migrateEvalDataToNewSchema("", "/tmp/out.json"),
		).rejects.toThrow(/empty/);
	});
});
