import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BaseAgent } from "@adk/agents";
import { afterEach, describe, expect, it } from "vitest";
import {
	AgentEvaluator,
	DEFAULT_CRITERIA,
	RESPONSE_MATCH_SCORE_KEY,
	loadJson,
} from "../../evaluation/agent-evaluator";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import type { EvalSet } from "../../evaluation/eval-set";

const tempDirs: string[] = [];

afterEach(async () => {
	const { rm } = await import("node:fs/promises");
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "adk-eval-"));
	tempDirs.push(dir);
	return dir;
}

describe("loadJson", () => {
	it("loads JSON objects from disk", async () => {
		const dir = await makeTempDir();
		const file = join(dir, "data.json");
		await writeFile(file, JSON.stringify({ hello: "world" }));
		await expect(loadJson(file)).resolves.toEqual({ hello: "world" });
	});

	it("throws a helpful error when the file is missing", async () => {
		await expect(loadJson("/tmp/adk-missing-eval-file.json")).rejects.toThrow(
			"Failed to load JSON",
		);
	});
});

describe("AgentEvaluator.findConfigForTestFile", () => {
	it("returns DEFAULT_CRITERIA when config is missing", async () => {
		const dir = await makeTempDir();
		const criteria = await AgentEvaluator.findConfigForTestFile(
			join(dir, "case.test.json"),
		);
		expect(criteria).toEqual(DEFAULT_CRITERIA);
	});

	it("returns criteria from test_config.json when present", async () => {
		const dir = await makeTempDir();
		await writeFile(
			join(dir, "test_config.json"),
			JSON.stringify({
				criteria: {
					[RESPONSE_MATCH_SCORE_KEY]: 0.9,
				},
			}),
		);

		const criteria = await AgentEvaluator.findConfigForTestFile(
			join(dir, "case.test.json"),
		);
		expect(criteria).toEqual({ [RESPONSE_MATCH_SCORE_KEY]: 0.9 });
	});
});

describe("AgentEvaluator.migrateEvalDataToNewSchema", () => {
	it("rejects empty paths", async () => {
		await expect(
			AgentEvaluator.migrateEvalDataToNewSchema("", "out.json"),
		).rejects.toThrow("One of oldEvalDataFile or newEvalDataFile is empty");
	});

	it("migrates old-schema arrays into EvalSet files", async () => {
		const dir = await makeTempDir();
		const oldFile = join(dir, "old.test.json");
		const newFile = join(dir, "new.evalset.json");
		await writeFile(
			oldFile,
			JSON.stringify([
				{
					query: "What is 2+2?",
					reference: "4",
				},
			]),
		);
		await writeFile(
			join(dir, "test_config.json"),
			JSON.stringify({
				criteria: {
					[RESPONSE_MATCH_SCORE_KEY]: 0.8,
				},
			}),
		);

		await AgentEvaluator.migrateEvalDataToNewSchema(oldFile, newFile);
		const migrated = JSON.parse(await readFile(newFile, "utf-8")) as EvalSet;

		expect(migrated.evalCases).toHaveLength(1);
		expect(
			migrated.evalCases[0].conversation[0].userContent.parts?.[0]?.text,
		).toBe("What is 2+2?");
		expect(
			migrated.evalCases[0].conversation[0].finalResponse?.parts?.[0]?.text,
		).toBe("4");
	});
});

describe("AgentEvaluator.evaluateEvalSet", () => {
	it("passes when ask agent matches reference under response match", async () => {
		const agent = {
			name: "math-agent",
			ask: async () => "4",
		} as unknown as BaseAgent;

		const evalSet: EvalSet = {
			evalSetId: "set-1",
			evalCases: [
				{
					evalId: "case-1",
					conversation: [
						{
							userContent: {
								role: "user",
								parts: [{ text: "What is 2+2?" }],
							},
							finalResponse: {
								role: "model",
								parts: [{ text: "4" }],
							},
							creationTimestamp: 1,
						},
					],
				},
			],
			creationTimestamp: Date.now(),
		};

		await expect(
			AgentEvaluator.evaluateEvalSet(
				agent,
				evalSet,
				{ [PrebuiltMetrics.RESPONSE_MATCH_SCORE]: 0.5 },
				1,
			),
		).resolves.toBeUndefined();
	});

	it("fails when ask agent response does not match reference", async () => {
		const agent = {
			name: "math-agent",
			ask: async () => "not four",
		} as unknown as BaseAgent;

		const evalSet: EvalSet = {
			evalSetId: "set-1",
			evalCases: [
				{
					evalId: "case-1",
					conversation: [
						{
							userContent: {
								role: "user",
								parts: [{ text: "What is 2+2?" }],
							},
							finalResponse: {
								role: "model",
								parts: [{ text: "4" }],
							},
							creationTimestamp: 1,
						},
					],
				},
			],
			creationTimestamp: Date.now(),
		};

		await expect(
			AgentEvaluator.evaluateEvalSet(
				agent,
				evalSet,
				{ [PrebuiltMetrics.RESPONSE_MATCH_SCORE]: 0.9 },
				1,
			),
		).rejects.toThrow("test failures");
	});

	it("evaluate rejects invalid dataset paths", async () => {
		const agent = { name: "a", ask: async () => "x" } as unknown as BaseAgent;
		await expect(
			AgentEvaluator.evaluate(agent, "/tmp/adk-does-not-exist-eval"),
		).rejects.toThrow("Invalid path");
	});
});
