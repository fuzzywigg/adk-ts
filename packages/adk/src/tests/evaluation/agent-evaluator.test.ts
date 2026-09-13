import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	AgentEvaluator,
	DEFAULT_CRITERIA,
	loadJson,
	RESPONSE_EVALUATION_SCORE_KEY,
	RESPONSE_MATCH_SCORE_KEY,
	TOOL_TRAJECTORY_SCORE_KEY,
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

	it("includes initial session state when migrating old schema", async () => {
		const dir = await makeTempDir();
		const oldFile = path.join(dir, "old.test.json");
		const newFile = path.join(dir, "new.evalset.json");
		const sessionFile = path.join(dir, "session.json");
		await fs.writeFile(
			oldFile,
			JSON.stringify([
				{
					query: "Q",
					reference: "A",
					expected_tool_use: [],
				},
			]),
		);
		await fs.writeFile(sessionFile, JSON.stringify({ topic: "adk" }));

		await AgentEvaluator.migrateEvalDataToNewSchema(
			oldFile,
			newFile,
			sessionFile,
		);

		const migrated = JSON.parse(await fs.readFile(newFile, "utf-8"));
		expect(migrated.evalCases[0].sessionInput).toEqual({
			appName: "test-app",
			userId: "test-user",
			state: { topic: "adk" },
		});
	});
});

describe("AgentEvaluator._validateInput", () => {
	it("rejects empty datasets and invalid criteria keys", () => {
		expect(() => (AgentEvaluator as any)._validateInput([], {})).toThrow(
			/empty/i,
		);
		expect(() =>
			(AgentEvaluator as any)._validateInput(
				[[{ query: "q", reference: "r" }]],
				{ bogus: 1 },
			),
		).toThrow(/Invalid criteria key/);
	});

	it("requires expected columns for trajectory and match metrics", () => {
		expect(() =>
			(AgentEvaluator as any)._validateInput([[{ query: "q" }]], {
				[TOOL_TRAJECTORY_SCORE_KEY]: 1,
			}),
		).toThrow(/expected_tool_use/);

		expect(() =>
			(AgentEvaluator as any)._validateInput([[{ query: "q" }]], {
				[RESPONSE_MATCH_SCORE_KEY]: 0.8,
			}),
		).toThrow(/reference/);

		expect(() =>
			(AgentEvaluator as any)._validateInput([[{ query: "q" }]], {
				[RESPONSE_EVALUATION_SCORE_KEY]: 0.5,
			}),
		).not.toThrow();
	});

	it("rejects non-object sample rows", () => {
		expect(() =>
			(AgentEvaluator as any)._validateInput([["not-an-object"]], {
				[RESPONSE_EVALUATION_SCORE_KEY]: 0.5,
			}),
		).toThrow(/dictionary/);
	});
});

describe("AgentEvaluator dataset helpers", () => {
	it("loads a single file and recursive directory datasets", async () => {
		const dir = await makeTempDir();
		const nested = path.join(dir, "nested");
		await fs.mkdir(nested);
		const fileA = path.join(dir, "a.test.json");
		const fileB = path.join(nested, "b.test.json");
		await fs.writeFile(fileA, JSON.stringify([{ query: "a" }]));
		await fs.writeFile(fileB, JSON.stringify([{ query: "b" }]));
		await fs.writeFile(
			path.join(dir, "skip.json"),
			JSON.stringify([{ query: "nope" }]),
		);

		const fromFile = await (AgentEvaluator as any)._loadDataset(fileA);
		expect(fromFile).toEqual([[{ query: "a" }]]);

		const fromDir = await (AgentEvaluator as any)._loadDataset(dir);
		expect(fromDir).toHaveLength(2);
		expect(
			fromDir
				.flat()
				.map((row: { query: string }) => row.query)
				.sort(),
		).toEqual(["a", "b"]);
	});

	it("loads new-format EvalSet files and rejects initialSession overrides", async () => {
		const dir = await makeTempDir();
		const file = path.join(dir, "new.evalset.json");
		const evalSet = {
			evalSetId: "set-1",
			evalCases: [{ evalId: "c1", conversation: [] }],
		};
		await fs.writeFile(file, JSON.stringify(evalSet));

		await expect(
			(AgentEvaluator as any)._loadEvalSetFromFile(file, DEFAULT_CRITERIA, {}),
		).resolves.toEqual(evalSet);

		await expect(
			(AgentEvaluator as any)._loadEvalSetFromFile(file, DEFAULT_CRITERIA, {
				x: 1,
			}),
		).rejects.toThrow(/Initial session should be specified/);
	});

	it("loads old-format files through _loadEvalSetFromFile with a warning", async () => {
		const dir = await makeTempDir();
		const file = path.join(dir, "old.test.json");
		await fs.writeFile(
			file,
			JSON.stringify([
				{
					query: "hello",
					reference: "world",
					expected_tool_use: [],
				},
			]),
		);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const evalSet = await (AgentEvaluator as any)._loadEvalSetFromFile(
			file,
			{
				[RESPONSE_MATCH_SCORE_KEY]: 0.8,
				[TOOL_TRAJECTORY_SCORE_KEY]: 1,
			},
			{},
		);

		expect(evalSet.evalCases).toHaveLength(1);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("fails _getInitialSession for missing files and returns {} when unset", async () => {
		await expect((AgentEvaluator as any)._getInitialSession()).resolves.toEqual(
			{},
		);
		await expect(
			(AgentEvaluator as any)._getInitialSession("/tmp/missing-session.json"),
		).rejects.toThrow(/Failed to load initial session/);
	});

	it("converts content and tool call helpers for printing", () => {
		expect((AgentEvaluator as any)._convertContentToText(undefined)).toBe("");
		expect(
			(AgentEvaluator as any)._convertContentToText({
				parts: [{ text: "a" }, { text: "" }, { text: "b" }],
			}),
		).toBe("a\nb");
		expect((AgentEvaluator as any)._convertToolCallsToText(undefined)).toBe("");
		expect(
			(AgentEvaluator as any)._convertToolCallsToText({
				toolUses: [{ name: "t", args: {} }],
			}),
		).toBe(JSON.stringify({ name: "t", args: {} }));
	});
});

describe("AgentEvaluator.evaluate", () => {
	it("rejects invalid paths", async () => {
		await expect(
			AgentEvaluator.evaluate({ name: "agent" } as any, "/tmp/no-such-eval"),
		).rejects.toThrow(/Invalid path/);
	});

	it("walks directories and delegates to evaluateEvalSet", async () => {
		const dir = await makeTempDir();
		const file = path.join(dir, "case.test.json");
		await fs.writeFile(
			file,
			JSON.stringify({
				evalSetId: "set-1",
				evalCases: [{ evalId: "c1", conversation: [] }],
			}),
		);

		const evaluateEvalSet = vi
			.spyOn(AgentEvaluator, "evaluateEvalSet")
			.mockResolvedValue(undefined);

		await AgentEvaluator.evaluate({ name: "agent" } as any, dir, 1);

		expect(evaluateEvalSet).toHaveBeenCalledOnce();
		expect(evaluateEvalSet.mock.calls[0][1]).toMatchObject({
			evalSetId: "set-1",
		});
		evaluateEvalSet.mockRestore();
	});
});

describe("AgentEvaluator metric aggregation helpers", () => {
	it("aggregates metric results and reports failures", () => {
		const grouped = (AgentEvaluator as any)._getEvalMetricResultsWithInvocation(
			[
				{
					evalId: "c1",
					evalMetricResultPerInvocation: [
						{
							actualInvocation: { invocationId: "a" },
							expectedInvocation: { invocationId: "e" },
							evalMetricResults: [
								{
									metricName: "score",
									threshold: 0.9,
									score: 0.5,
									evalStatus: "failed",
								},
							],
						},
					],
				},
			],
		);

		expect(grouped.score).toHaveLength(1);

		const failures = (AgentEvaluator as any)._processMetricsAndGetFailures(
			grouped,
			false,
			"agent",
		);
		expect(failures[0]).toContain("score for agent Failed");
		expect(failures[0]).toContain("Expected 0.9");
	});

	it("treats empty score lists as not evaluated failures", () => {
		const failures = (AgentEvaluator as any)._processMetricsAndGetFailures(
			{
				empty: [
					{
						actualInvocation: {},
						expectedInvocation: {},
						evalMetricResult: { metricName: "empty", threshold: 1 },
					},
				],
			},
			false,
			"agent",
		);
		expect(failures[0]).toContain("but got undefined");
	});
});
