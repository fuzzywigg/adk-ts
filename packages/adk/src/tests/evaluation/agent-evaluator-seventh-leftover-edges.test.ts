import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	AgentEvaluator,
	DEFAULT_CRITERIA,
	NUM_RUNS,
	QUERY_COLUMN,
	REFERENCE_COLUMN,
	RESPONSE_MATCH_SCORE_KEY,
} from "../../evaluation/agent-evaluator";
import { EvalStatus } from "../../evaluation/evaluator";
import * as constants from "../../evaluation/constants";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "adk-eval-seventh-"));
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

describe("AgentEvaluator seventh leftover edges (post #158)", () => {
	it("NUM_RUNS export is 2 and distinct from constants.NUM_RUNS=4", () => {
		expect(NUM_RUNS).toBe(2);
		expect(constants.NUM_RUNS).toBe(4);
		expect(NUM_RUNS).not.toBe(constants.NUM_RUNS);
	});

	it("findConfigForTestFile returns criteria:null (typeof null === 'object')", async () => {
		const dir = await makeTempDir();
		await fs.writeFile(
			path.join(dir, "test_config.json"),
			JSON.stringify({ criteria: null }),
		);
		const testFile = path.join(dir, "case.test.json");
		await fs.writeFile(testFile, "[]");

		const criteria = await AgentEvaluator.findConfigForTestFile(testFile);
		expect(criteria).toBeNull();
	});

	it("findConfigForTestFile swallows corrupt JSON to DEFAULT_CRITERIA", async () => {
		const dir = await makeTempDir();
		await fs.writeFile(path.join(dir, "test_config.json"), "{not-json");
		const testFile = path.join(dir, "case.test.json");
		await fs.writeFile(testFile, "[]");

		const criteria = await AgentEvaluator.findConfigForTestFile(testFile);
		expect(criteria).toEqual(DEFAULT_CRITERIA);
	});

	it("old-schema reference:'' omits finalResponse via falsy ?", async () => {
		const dir = await makeTempDir();
		const evalFile = path.join(dir, "old.test.json");
		await fs.writeFile(
			evalFile,
			JSON.stringify([{ [QUERY_COLUMN]: "q", [REFERENCE_COLUMN]: "" }]),
		);

		const evalSet = await (AgentEvaluator as any)._getEvalSetFromOldFormat(
			evalFile,
			{ [RESPONSE_MATCH_SCORE_KEY]: 0.8 },
			{},
		);
		expect(evalSet.evalCases[0].conversation[0].finalResponse).toBeUndefined();
	});

	it.each([
		{
			label: "evalSetId empty string",
			payload: { evalSetId: "", evalCases: [{ evalId: "e" }] },
		},
		{
			label: "evalCases null",
			payload: { evalSetId: "set", evalCases: null },
		},
	])("_loadEvalSetFromFile falls through to old format for $label", async ({
		payload,
	}) => {
		const dir = await makeTempDir();
		const evalFile = path.join(dir, "mixed.test.json");
		await fs.writeFile(evalFile, JSON.stringify(payload));

		await expect(
			(AgentEvaluator as any)._loadEvalSetFromFile(
				evalFile,
				DEFAULT_CRITERIA,
				{},
			),
		).rejects.toThrow();
	});

	it("_getInitialSession throws on invalid JSON file", async () => {
		const dir = await makeTempDir();
		const sessionFile = path.join(dir, "session.json");
		await fs.writeFile(sessionFile, "{broken");

		await expect(
			(AgentEvaluator as any)._getInitialSession(sessionFile),
		).rejects.toThrow(`Failed to load initial session from ${sessionFile}`);
	});

	it("_convertContentToText keeps whitespace-only parts (length > 0)", () => {
		const text = (AgentEvaluator as any)._convertContentToText({
			parts: [{ text: " " }, { text: "" }, { text: "x" }],
		});
		expect(text).toBe(" \nx");
	});

	it("_processMetricsAndGetFailures: score 0 + threshold 0 → PASSED, no failure", () => {
		const failures = (AgentEvaluator as any)._processMetricsAndGetFailures(
			{
				metric_a: [
					{
						actualInvocation: { creationTimestamp: 1 },
						expectedInvocation: { creationTimestamp: 1 },
						evalMetricResult: {
							metricName: "metric_a",
							threshold: 0,
							score: 0,
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
