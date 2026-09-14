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
	SAFETY_V1_KEY,
	TOOL_TRAJECTORY_SCORE_KEY,
} from "../../evaluation/agent-evaluator";
import { EvalStatus } from "../../evaluation/evaluator";
import { LocalEvalService } from "../../evaluation/local-eval-service";

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

	it("evaluates a single file path with numRuns forwarded", async () => {
		const dir = await makeTempDir();
		const file = path.join(dir, "solo.test.json");
		await fs.writeFile(
			file,
			JSON.stringify({
				evalSetId: "solo-set",
				evalCases: [{ evalId: "s1", conversation: [] }],
				creationTimestamp: 1,
			}),
		);

		const evaluateEvalSet = vi
			.spyOn(AgentEvaluator, "evaluateEvalSet")
			.mockResolvedValue(undefined);

		await AgentEvaluator.evaluate({ name: "agent" } as any, file, 3);

		expect(evaluateEvalSet).toHaveBeenCalledOnce();
		expect(evaluateEvalSet.mock.calls[0][3]).toBe(3);
		evaluateEvalSet.mockRestore();
	});

	it("skips nested non-test json when walking directories", async () => {
		const dir = await makeTempDir();
		const nested = path.join(dir, "nested");
		await fs.mkdir(nested);
		await fs.writeFile(path.join(nested, "notes.json"), "[]");
		await fs.writeFile(
			path.join(nested, "ok.test.json"),
			JSON.stringify({
				evalSetId: "nested-set",
				evalCases: [],
				creationTimestamp: 1,
			}),
		);

		const evaluateEvalSet = vi
			.spyOn(AgentEvaluator, "evaluateEvalSet")
			.mockResolvedValue(undefined);

		await AgentEvaluator.evaluate({ name: "agent" } as any, dir, 1);

		expect(evaluateEvalSet).toHaveBeenCalledOnce();
		expect(evaluateEvalSet.mock.calls[0][1].evalSetId).toBe("nested-set");
		evaluateEvalSet.mockRestore();
	});
});

describe("AgentEvaluator.evaluateEvalSet", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function stubLocalEvalService(caseResults: any[]) {
		vi.spyOn(LocalEvalService.prototype, "performInference").mockImplementation(
			async function* () {
				yield [
					{
						invocationId: "expected-0",
						userContent: { role: "user", parts: [{ text: "q" }] },
						creationTimestamp: 1,
					},
					{
						invocationId: "actual-0",
						userContent: { role: "user", parts: [{ text: "q" }] },
						finalResponse: { role: "model", parts: [{ text: "a" }] },
						creationTimestamp: 1,
					},
				];
			},
		);
		vi.spyOn(LocalEvalService.prototype, "evaluate").mockImplementation(
			async function* () {
				yield {
					evalSetResultId: "result-1",
					evalSetId: "set-1",
					evalCaseResults: caseResults,
					creationTimestamp: 1,
				};
			},
		);
	}

	it("resolves when all metric averages meet thresholds", async () => {
		stubLocalEvalService([
			{
				evalSetId: "set-1",
				evalId: "c1",
				finalEvalStatus: EvalStatus.PASSED,
				overallEvalMetricResults: [],
				evalMetricResultPerInvocation: [
					{
						actualInvocation: {
							invocationId: "a",
							userContent: { role: "user", parts: [{ text: "q" }] },
							finalResponse: { role: "model", parts: [{ text: "ok" }] },
							creationTimestamp: 1,
						},
						expectedInvocation: {
							invocationId: "e",
							userContent: { role: "user", parts: [{ text: "q" }] },
							finalResponse: { role: "model", parts: [{ text: "ok" }] },
							creationTimestamp: 1,
						},
						evalMetricResults: [
							{
								metricName: RESPONSE_MATCH_SCORE_KEY,
								threshold: 0.8,
								score: 1,
								evalStatus: EvalStatus.PASSED,
							},
						],
					},
				],
				sessionId: "s1",
			},
		]);

		await expect(
			AgentEvaluator.evaluateEvalSet(
				{ name: "pass-agent" } as any,
				{
					evalSetId: "set-1",
					evalCases: [],
					creationTimestamp: 1,
				},
				{ [RESPONSE_MATCH_SCORE_KEY]: 0.8 },
				1,
			),
		).resolves.toBeUndefined();
	});

	it("throws aggregated failures and prints details when requested", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {});

		stubLocalEvalService([
			{
				evalSetId: "set-1",
				evalId: "c1",
				finalEvalStatus: EvalStatus.FAILED,
				overallEvalMetricResults: [],
				evalMetricResultPerInvocation: [
					{
						actualInvocation: {
							invocationId: "a",
							userContent: { role: "user", parts: [{ text: "prompt" }] },
							finalResponse: {
								role: "model",
								parts: [{ text: "actual" }, { text: "" }],
							},
							intermediateData: {
								toolUses: [{ name: "search", args: { q: "1" } }],
								intermediateResponses: [],
							},
							creationTimestamp: 1,
						},
						expectedInvocation: {
							invocationId: "e",
							userContent: { role: "user", parts: [{ text: "prompt" }] },
							finalResponse: { role: "model", parts: [{ text: "expected" }] },
							intermediateData: {
								toolUses: [{ name: "search", args: { q: "1" } }],
								intermediateResponses: [],
							},
							creationTimestamp: 1,
						},
						evalMetricResults: [
							{
								metricName: RESPONSE_MATCH_SCORE_KEY,
								threshold: 0.95,
								score: 0.1,
								evalStatus: EvalStatus.FAILED,
							},
						],
					},
				],
				sessionId: "s1",
			},
		]);

		await expect(
			AgentEvaluator.evaluateEvalSet(
				{ name: "" } as any,
				{
					evalSetId: "set-1",
					evalCases: [],
					creationTimestamp: 1,
				},
				{ [RESPONSE_MATCH_SCORE_KEY]: 0.95 },
				1,
				true,
			),
		).rejects.toThrow(/test failures/);

		expect(logSpy).toHaveBeenCalled();
		expect(tableSpy).toHaveBeenCalled();
		const tableArg = tableSpy.mock.calls[0][0] as Array<Record<string, string>>;
		expect(tableArg[0].prompt).toBe("prompt");
		expect(tableArg[0].expectedResponse).toBe("expected");
		expect(tableArg[0].actualResponse).toBe("actual");
		expect(tableArg[0].expectedToolCalls).toContain("search");
	});

	it("runs performInference once per numRuns before evaluate", async () => {
		const inference = vi
			.spyOn(LocalEvalService.prototype, "performInference")
			.mockImplementation(async function* () {
				yield [];
			});
		const evaluate = vi
			.spyOn(LocalEvalService.prototype, "evaluate")
			.mockImplementation(async function* () {
				yield {
					evalSetResultId: "r",
					evalSetId: "set-1",
					evalCaseResults: [],
					creationTimestamp: 1,
				};
			});

		await AgentEvaluator.evaluateEvalSet(
			{ name: "agent" } as any,
			{ evalSetId: "set-1", evalCases: [], creationTimestamp: 1 },
			{ [RESPONSE_MATCH_SCORE_KEY]: 0.5 },
			3,
		);

		expect(inference).toHaveBeenCalledTimes(3);
		expect(evaluate).toHaveBeenCalledOnce();
	});

	it("groups metric results across multiple case runs", async () => {
		stubLocalEvalService([
			{
				evalSetId: "set-1",
				evalId: "c1",
				finalEvalStatus: EvalStatus.PASSED,
				overallEvalMetricResults: [],
				evalMetricResultPerInvocation: [
					{
						actualInvocation: { invocationId: "a1", creationTimestamp: 1 },
						expectedInvocation: { invocationId: "e1", creationTimestamp: 1 },
						evalMetricResults: [
							{
								metricName: "m1",
								threshold: 0.5,
								score: 0.6,
								evalStatus: EvalStatus.PASSED,
							},
						],
					},
				],
				sessionId: "s",
			},
			{
				evalSetId: "set-1",
				evalId: "c1",
				finalEvalStatus: EvalStatus.PASSED,
				overallEvalMetricResults: [],
				evalMetricResultPerInvocation: [
					{
						actualInvocation: { invocationId: "a2", creationTimestamp: 1 },
						expectedInvocation: { invocationId: "e2", creationTimestamp: 1 },
						evalMetricResults: [
							{
								metricName: "m1",
								threshold: 0.5,
								score: 0.8,
								evalStatus: EvalStatus.PASSED,
							},
						],
					},
				],
				sessionId: "s",
			},
		]);

		await expect(
			AgentEvaluator.evaluateEvalSet(
				{ name: "agent" } as any,
				{ evalSetId: "set-1", evalCases: [], creationTimestamp: 1 },
				{ m1: 0.5 } as any,
				1,
			),
		).resolves.toBeUndefined();
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

	it("skips failures when average score meets threshold", () => {
		const failures = (AgentEvaluator as any)._processMetricsAndGetFailures(
			{
				ok: [
					{
						actualInvocation: {},
						expectedInvocation: {},
						evalMetricResult: {
							metricName: "ok",
							threshold: 0.5,
							score: 0.7,
							evalStatus: EvalStatus.PASSED,
						},
					},
					{
						actualInvocation: {},
						expectedInvocation: {},
						evalMetricResult: {
							metricName: "ok",
							threshold: 0.5,
							score: 0.9,
							evalStatus: EvalStatus.PASSED,
						},
					},
				],
			},
			false,
			"agent",
		);
		expect(failures).toEqual([]);
	});

	it("printDetails handles missing content and tool uses", () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {});

		(AgentEvaluator as any)._printDetails(
			[
				{
					actualInvocation: { creationTimestamp: 1 },
					expectedInvocation: {
						userContent: { parts: [{ text: "" }, { inlineData: {} }] },
						creationTimestamp: 1,
					},
					evalMetricResult: {
						metricName: "x",
						threshold: 1,
						score: 0,
						evalStatus: EvalStatus.FAILED,
					},
				},
			],
			EvalStatus.FAILED,
			0,
			"x",
			1,
		);

		const row = (tableSpy.mock.calls[0][0] as any[])[0];
		expect(row.prompt).toBe("");
		expect(row.expectedResponse).toBe("");
		expect(row.actualResponse).toBe("");
		expect(row.expectedToolCalls).toBe("");
		expect(row.actualToolCalls).toBe("");
		logSpy.mockRestore();
		tableSpy.mockRestore();
	});

	it("uses threshold 0 when metric result omits threshold", () => {
		const failures = (AgentEvaluator as any)._processMetricsAndGetFailures(
			{
				bare: [
					{
						actualInvocation: {},
						expectedInvocation: {},
						evalMetricResult: {
							metricName: "bare",
							score: -1,
							evalStatus: EvalStatus.FAILED,
						},
					},
				],
			},
			false,
			"agent",
		);
		expect(failures[0]).toContain("Expected 0");
	});
});

describe("AgentEvaluator._validateInput response evaluation and safety", () => {
	it("requires query for RESPONSE_EVALUATION_SCORE_KEY", () => {
		expect(() =>
			(AgentEvaluator as any)._validateInput([[{ reference: "x" }]], {
				[RESPONSE_EVALUATION_SCORE_KEY]: 0.5,
			}),
		).toThrow(/must include 'query'/);
	});

	it("accepts SAFETY_V1 without extra columns", () => {
		expect(() =>
			(AgentEvaluator as any)._validateInput([[{ query: "hi" }]], {
				[SAFETY_V1_KEY]: 0.8,
			}),
		).not.toThrow();
	});

	it("rejects empty sample arrays inside the dataset", () => {
		expect(() =>
			(AgentEvaluator as any)._validateInput([[]], {
				[RESPONSE_MATCH_SCORE_KEY]: 0.5,
			}),
		).toThrow(/evaluation dataset is empty/);
	});
});

describe("AgentEvaluator.findConfigForTestFile criteria shape", () => {
	it("falls back when criteria exists but is not an object", async () => {
		const dir = await makeTempDir();
		const testFile = path.join(dir, "case.test.json");
		await fs.writeFile(testFile, "[]");
		await fs.writeFile(
			path.join(dir, "test_config.json"),
			JSON.stringify({ criteria: "not-an-object" }),
		);

		await expect(
			AgentEvaluator.findConfigForTestFile(testFile),
		).resolves.toEqual(DEFAULT_CRITERIA);
	});
});

describe("AgentEvaluator.migrateEvalDataToNewSchema edges", () => {
	it("rejects empty newEvalDataFile", async () => {
		await expect(
			AgentEvaluator.migrateEvalDataToNewSchema("/tmp/old.json", ""),
		).rejects.toThrow(/empty/);
	});

	it("omits finalResponse and intermediateData when old columns are absent", async () => {
		const dir = await makeTempDir();
		const oldFile = path.join(dir, "old.test.json");
		const newFile = path.join(dir, "new.evalset.json");
		await fs.writeFile(oldFile, JSON.stringify([{ query: "only-query" }]));
		await fs.writeFile(
			path.join(dir, "test_config.json"),
			JSON.stringify({
				criteria: { [RESPONSE_EVALUATION_SCORE_KEY]: 0.5 },
			}),
		);

		await AgentEvaluator.migrateEvalDataToNewSchema(oldFile, newFile);
		const migrated = JSON.parse(await fs.readFile(newFile, "utf-8"));
		expect(migrated.evalCases[0].conversation[0].finalResponse).toBeUndefined();
		expect(
			migrated.evalCases[0].conversation[0].intermediateData,
		).toBeUndefined();
		expect(
			migrated.evalCases[0].conversation[0].userContent.parts[0].text,
		).toBe("only-query");
		expect(migrated.evalCases[0].sessionInput).toBeUndefined();
	});

	it("uses empty user text when query is missing under RESPONSE_EVALUATION", async () => {
		const dir = await makeTempDir();
		const oldFile = path.join(dir, "old.test.json");
		const newFile = path.join(dir, "new.evalset.json");
		await fs.writeFile(oldFile, JSON.stringify([{ reference: "answer-only" }]));
		await fs.writeFile(
			path.join(dir, "test_config.json"),
			JSON.stringify({
				criteria: { [RESPONSE_EVALUATION_SCORE_KEY]: 0.5 },
			}),
		);

		await expect(
			AgentEvaluator.migrateEvalDataToNewSchema(oldFile, newFile),
		).rejects.toThrow(/must include 'query'/);
	});

	it("migrates missing query as empty text when criteria only needs trajectory tools", async () => {
		const dir = await makeTempDir();
		const oldFile = path.join(dir, "old.test.json");
		const newFile = path.join(dir, "new.evalset.json");
		await fs.writeFile(
			oldFile,
			JSON.stringify([{ query: "", expected_tool_use: [{ name: "t" }] }]),
		);
		await fs.writeFile(
			path.join(dir, "test_config.json"),
			JSON.stringify({
				criteria: { [TOOL_TRAJECTORY_SCORE_KEY]: 1 },
			}),
		);

		await AgentEvaluator.migrateEvalDataToNewSchema(oldFile, newFile);
		const migrated = JSON.parse(await fs.readFile(newFile, "utf-8"));
		expect(
			migrated.evalCases[0].conversation[0].userContent.parts[0].text,
		).toBe("");
		expect(
			migrated.evalCases[0].conversation[0].intermediateData.toolUses,
		).toEqual([{ name: "t" }]);
	});
});

describe("AgentEvaluator._loadEvalSetFromFile and _loadDataset edges", () => {
	it("wraps a non-array JSON object as a single-row dataset", async () => {
		const dir = await makeTempDir();
		const file = path.join(dir, "object.test.json");
		await fs.writeFile(
			file,
			JSON.stringify({
				query: "q",
				reference: "r",
				expected_tool_use: [],
			}),
		);

		const loaded = await (AgentEvaluator as any)._loadDataset(file);
		expect(loaded).toEqual([
			[
				{
					query: "q",
					reference: "r",
					expected_tool_use: [],
				},
			],
		]);
	});

	it("treats JSON objects lacking evalSetId/evalCases as old format", async () => {
		const dir = await makeTempDir();
		const file = path.join(dir, "legacy-shaped.json");
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

		expect(warn).toHaveBeenCalledWith(expect.stringMatching(/older format/));
		expect(evalSet.evalCases[0].conversation[0].userContent.parts[0].text).toBe(
			"hello",
		);
		warn.mockRestore();
	});

	it("fails when eval set file content is invalid JSON", async () => {
		const dir = await makeTempDir();
		const file = path.join(dir, "bad.evalset.json");
		await fs.writeFile(file, "{not-json");

		await expect(
			(AgentEvaluator as any)._loadEvalSetFromFile(file, DEFAULT_CRITERIA, {}),
		).rejects.toThrow(/Failed to process eval set file/);
	});

	it("fails when eval set file is missing", async () => {
		await expect(
			(AgentEvaluator as any)._loadEvalSetFromFile(
				"/tmp/adk-missing-evalset.json",
				DEFAULT_CRITERIA,
				{},
			),
		).rejects.toThrow(/Failed to process eval set file/);
	});
});

describe("AgentEvaluator._validateInput ALLOWED_CRITERIA edges", () => {
	it("rejects FINAL_RESPONSE_MATCH_V2 for old-schema validation", () => {
		expect(() =>
			(AgentEvaluator as any)._validateInput(
				[[{ query: "q", reference: "r" }]],
				{ final_response_match_v2: 0.8 },
			),
		).toThrow(/Invalid criteria key/);
	});

	it("accepts SAFETY_V1_KEY in ALLOWED_CRITERIA", () => {
		expect(() =>
			(AgentEvaluator as any)._validateInput([[{ query: "q" }]], {
				[SAFETY_V1_KEY]: 0.9,
			}),
		).not.toThrow();
	});

	it("rejects null/undefined dataset", () => {
		expect(() =>
			(AgentEvaluator as any)._validateInput(null, {
				[RESPONSE_EVALUATION_SCORE_KEY]: 0.5,
			}),
		).toThrow(/empty/i);
	});
});

describe("AgentEvaluator._processMetricsAndGetFailures edges", () => {
	it("treats average exactly equal to threshold as PASSED", () => {
		const failures = (AgentEvaluator as any)._processMetricsAndGetFailures(
			{
				exact: [
					{
						actualInvocation: {},
						expectedInvocation: {},
						evalMetricResult: {
							metricName: "exact",
							threshold: 0.8,
							score: 0.8,
							evalStatus: EvalStatus.PASSED,
						},
					},
				],
			},
			false,
			"agent",
		);
		expect(failures).toEqual([]);
	});

	it("uses Unknown Agent when agent name is empty and printDetailedResults is false", () => {
		const failures = (AgentEvaluator as any)._processMetricsAndGetFailures(
			{
				m: [
					{
						actualInvocation: {},
						expectedInvocation: {},
						evalMetricResult: {
							metricName: "m",
							threshold: 1,
							score: 0,
							evalStatus: EvalStatus.FAILED,
						},
					},
				],
			},
			false,
			"",
		);
		expect(failures[0]).toContain("m for  Failed");
	});

	it("aggregates multiple metric failures", () => {
		const failures = (AgentEvaluator as any)._processMetricsAndGetFailures(
			{
				a: [
					{
						actualInvocation: {},
						expectedInvocation: {},
						evalMetricResult: {
							metricName: "a",
							threshold: 1,
							score: 0.1,
							evalStatus: EvalStatus.FAILED,
						},
					},
				],
				b: [
					{
						actualInvocation: {},
						expectedInvocation: {},
						evalMetricResult: {
							metricName: "b",
							threshold: 1,
							score: 0.2,
							evalStatus: EvalStatus.FAILED,
						},
					},
				],
			},
			false,
			"multi",
		);
		expect(failures).toHaveLength(2);
		expect(failures[0]).toContain("a for multi Failed");
		expect(failures[1]).toContain("b for multi Failed");
	});

	it("filters undefined scores out of the average", () => {
		const failures = (AgentEvaluator as any)._processMetricsAndGetFailures(
			{
				mixed: [
					{
						actualInvocation: {},
						expectedInvocation: {},
						evalMetricResult: {
							metricName: "mixed",
							threshold: 0.5,
							score: undefined,
							evalStatus: EvalStatus.NOT_EVALUATED,
						},
					},
					{
						actualInvocation: {},
						expectedInvocation: {},
						evalMetricResult: {
							metricName: "mixed",
							threshold: 0.5,
							score: 0.9,
							evalStatus: EvalStatus.PASSED,
						},
					},
				],
			},
			false,
			"agent",
		);
		expect(failures).toEqual([]);
	});
});

describe("AgentEvaluator.evaluateEvalSet failure messaging", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("includes Unknown Agent in failure text when agent name is missing", async () => {
		vi.spyOn(LocalEvalService.prototype, "performInference").mockImplementation(
			async function* () {
				yield [];
			},
		);
		vi.spyOn(LocalEvalService.prototype, "evaluate").mockImplementation(
			async function* () {
				yield {
					evalSetResultId: "r",
					evalSetId: "set-1",
					evalCaseResults: [
						{
							evalSetId: "set-1",
							evalId: "c1",
							finalEvalStatus: EvalStatus.FAILED,
							overallEvalMetricResults: [],
							evalMetricResultPerInvocation: [
								{
									actualInvocation: { creationTimestamp: 1 },
									expectedInvocation: { creationTimestamp: 1 },
									evalMetricResults: [
										{
											metricName: RESPONSE_MATCH_SCORE_KEY,
											threshold: 0.9,
											score: 0.1,
											evalStatus: EvalStatus.FAILED,
										},
									],
								},
							],
							sessionId: "s",
						},
					],
					creationTimestamp: 1,
				};
			},
		);

		await expect(
			AgentEvaluator.evaluateEvalSet(
				{ name: undefined } as any,
				{ evalSetId: "set-1", evalCases: [], creationTimestamp: 1 },
				{ [RESPONSE_MATCH_SCORE_KEY]: 0.9 },
				1,
				false,
			),
		).rejects.toThrow(/Unknown Agent/);
	});

	it("evaluates multiple test files in a directory", async () => {
		const dir = await makeTempDir();
		await fs.writeFile(
			path.join(dir, "a.test.json"),
			JSON.stringify({
				evalSetId: "a",
				evalCases: [],
				creationTimestamp: 1,
			}),
		);
		await fs.writeFile(
			path.join(dir, "b.test.json"),
			JSON.stringify({
				evalSetId: "b",
				evalCases: [],
				creationTimestamp: 1,
			}),
		);

		const evaluateEvalSet = vi
			.spyOn(AgentEvaluator, "evaluateEvalSet")
			.mockResolvedValue(undefined);

		await AgentEvaluator.evaluate({ name: "agent" } as any, dir, 1);

		expect(evaluateEvalSet).toHaveBeenCalledTimes(2);
		const ids = evaluateEvalSet.mock.calls
			.map((call) => call[1].evalSetId)
			.sort();
		expect(ids).toEqual(["a", "b"]);
		evaluateEvalSet.mockRestore();
	});

	it("loads initialSessionFile for old-schema evaluate path", async () => {
		const dir = await makeTempDir();
		const file = path.join(dir, "old.test.json");
		const sessionFile = path.join(dir, "session.json");
		await fs.writeFile(
			file,
			JSON.stringify([
				{
					query: "q",
					reference: "r",
					expected_tool_use: [],
				},
			]),
		);
		await fs.writeFile(sessionFile, JSON.stringify({ seeded: true }));
		await fs.writeFile(
			path.join(dir, "test_config.json"),
			JSON.stringify({
				criteria: {
					[RESPONSE_MATCH_SCORE_KEY]: 0.8,
					[TOOL_TRAJECTORY_SCORE_KEY]: 1,
				},
			}),
		);

		const evaluateEvalSet = vi
			.spyOn(AgentEvaluator, "evaluateEvalSet")
			.mockResolvedValue(undefined);

		await AgentEvaluator.evaluate(
			{ name: "agent" } as any,
			file,
			1,
			sessionFile,
		);

		expect(evaluateEvalSet).toHaveBeenCalledOnce();
		expect(evaluateEvalSet.mock.calls[0][1].evalCases[0].sessionInput).toEqual({
			appName: "test-app",
			userId: "test-user",
			state: { seeded: true },
		});
		evaluateEvalSet.mockRestore();
	});
});

describe("AgentEvaluator helper conversions", () => {
	it("joins multiple tool uses with newlines", () => {
		expect(
			(AgentEvaluator as any)._convertToolCallsToText({
				toolUses: [
					{ name: "a", args: { x: 1 } },
					{ name: "b", args: {} },
				],
			}),
		).toBe(
			`${JSON.stringify({ name: "a", args: { x: 1 } })}\n${JSON.stringify({ name: "b", args: {} })}`,
		);
	});

	it("returns empty string for intermediateData without toolUses", () => {
		expect(
			(AgentEvaluator as any)._convertToolCallsToText({
				intermediateResponses: [],
			}),
		).toBe("");
	});

	it("returns empty string for content without parts", () => {
		expect((AgentEvaluator as any)._convertContentToText({})).toBe("");
	});

	it("rejects device paths that are neither files nor directories", async () => {
		await expect(
			(AgentEvaluator as any)._loadDataset("/dev/null"),
		).rejects.toThrow(/Invalid input path: \/dev\/null/);
	});

	it("rejects socket-like character devices under /dev", async () => {
		await expect(
			(AgentEvaluator as any)._loadDataset("/dev/zero"),
		).rejects.toThrow(/Invalid input path/);
	});

	it("wraps directory-loaded JSON objects that are not arrays", async () => {
		const dir = await makeTempDir();
		await fs.writeFile(
			path.join(dir, "single.test.json"),
			JSON.stringify({
				query: "solo",
				reference: "answer",
				expected_tool_use: [],
			}),
		);

		const loaded = await (AgentEvaluator as any)._loadDataset(dir);
		expect(loaded).toEqual([
			[
				{
					query: "solo",
					reference: "answer",
					expected_tool_use: [],
				},
			],
		]);
	});
});
