import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	AgentEvaluator,
	TOOL_TRAJECTORY_SCORE_KEY,
} from "../../evaluation/agent-evaluator";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
	const dir = await fs.mkdtemp(
		path.join(os.tmpdir(), "adk-eval-fifth-leftover-"),
	);
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

describe("AgentEvaluator old-schema falsy coalesce fifth leftover (post #165)", () => {
	it.each([
		{ label: "null query", query: null, expectedText: "" },
		{ label: "false query", query: false, expectedText: "" },
		{ label: "0 query", query: 0, expectedText: "" },
		{ label: '"" query', query: "", expectedText: "" },
	] as const)('_getEvalSetFromOldFormat query || "": $label', async ({
		query,
		expectedText,
	}) => {
		const dir = await makeTempDir();
		const oldFile = path.join(dir, "old.test.json");
		await fs.writeFile(
			oldFile,
			JSON.stringify([
				{
					query,
					expected_tool_use: [{ name: "tool-a" }],
				},
			]),
		);
		await fs.writeFile(
			path.join(dir, "test_config.json"),
			JSON.stringify({
				criteria: { [TOOL_TRAJECTORY_SCORE_KEY]: 1 },
			}),
		);

		const evalSet = await (AgentEvaluator as any)._getEvalSetFromOldFormat(
			oldFile,
			{ [TOOL_TRAJECTORY_SCORE_KEY]: 1 },
			{},
		);
		expect(evalSet.evalCases[0].conversation[0].userContent.parts[0].text).toBe(
			expectedText,
		);
		expect(
			evalSet.evalCases[0].conversation[0].intermediateData.toolUses,
		).toEqual([{ name: "tool-a" }]);
	});

	it.each([
		{ label: "null reference", reference: null },
		{ label: "undefined reference", reference: undefined },
		{ label: "false reference", reference: false },
		{ label: "0 reference", reference: 0 },
		{ label: '"" reference', reference: "" },
	] as const)("falsy REFERENCE_COLUMN $label omits finalResponse via truthy ?", async ({
		reference,
	}) => {
		const dir = await makeTempDir();
		const oldFile = path.join(dir, "old.test.json");
		await fs.writeFile(
			oldFile,
			JSON.stringify([
				{
					query: "q",
					reference,
					expected_tool_use: [{ name: "t" }],
				},
			]),
		);

		const evalSet = await (AgentEvaluator as any)._getEvalSetFromOldFormat(
			oldFile,
			{ [TOOL_TRAJECTORY_SCORE_KEY]: 1 },
			{},
		);
		expect(evalSet.evalCases[0].conversation[0].finalResponse).toBeUndefined();
	});

	it("truthy reference string includes finalResponse", async () => {
		const dir = await makeTempDir();
		const oldFile = path.join(dir, "old.test.json");
		await fs.writeFile(
			oldFile,
			JSON.stringify([
				{
					query: "q",
					reference: "answer",
					expected_tool_use: [{ name: "t" }],
				},
			]),
		);

		const evalSet = await (AgentEvaluator as any)._getEvalSetFromOldFormat(
			oldFile,
			{ [TOOL_TRAJECTORY_SCORE_KEY]: 1 },
			{},
		);
		expect(
			evalSet.evalCases[0].conversation[0].finalResponse.parts[0].text,
		).toBe("answer");
	});

	it("empty-array expected_tool_use is truthy so intermediateData is included", async () => {
		const dir = await makeTempDir();
		const oldFile = path.join(dir, "old.test.json");
		await fs.writeFile(
			oldFile,
			JSON.stringify([{ query: "q", expected_tool_use: [] }]),
		);

		const evalSet = await (AgentEvaluator as any)._getEvalSetFromOldFormat(
			oldFile,
			{ [TOOL_TRAJECTORY_SCORE_KEY]: 1 },
			{},
		);
		expect(evalSet.evalCases[0].conversation[0].intermediateData).toEqual({
			toolUses: [],
			intermediateResponses: [],
		});
	});

	it("initialSession empty object omits sessionInput; non-empty includes it", async () => {
		const dir = await makeTempDir();
		const oldFile = path.join(dir, "old.test.json");
		await fs.writeFile(
			oldFile,
			JSON.stringify([{ query: "q", expected_tool_use: [{ name: "t" }] }]),
		);

		const without = await (AgentEvaluator as any)._getEvalSetFromOldFormat(
			oldFile,
			{ [TOOL_TRAJECTORY_SCORE_KEY]: 1 },
			{},
		);
		expect(without.evalCases[0].sessionInput).toBeUndefined();

		const withSession = await (AgentEvaluator as any)._getEvalSetFromOldFormat(
			oldFile,
			{ [TOOL_TRAJECTORY_SCORE_KEY]: 1 },
			{ flag: true },
		);
		expect(withSession.evalCases[0].sessionInput).toEqual({
			appName: "test-app",
			userId: "test-user",
			state: { flag: true },
		});
	});
});
