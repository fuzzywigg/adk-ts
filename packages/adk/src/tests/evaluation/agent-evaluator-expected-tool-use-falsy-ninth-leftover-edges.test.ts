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
		path.join(os.tmpdir(), "adk-eval-ninth-tool-use-"),
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

/**
 * Leftover: fifth leftover asserted empty-array expected_tool_use is truthy and
 * includes intermediateData. Explicit falsy values (null/false/0/"") omit it.
 */
describe("agent-evaluator expected_tool_use falsy ninth leftover edges", () => {
	it.each([
		{ label: "null", expected_tool_use: null },
		{ label: "false", expected_tool_use: false },
		{ label: "0", expected_tool_use: 0 },
		{ label: '""', expected_tool_use: "" },
	] as const)("falsy expected_tool_use ($label) omits intermediateData", async ({
		expected_tool_use,
	}) => {
		const dir = await makeTempDir();
		const oldFile = path.join(dir, "old.test.json");
		await fs.writeFile(
			oldFile,
			JSON.stringify([{ query: "q", expected_tool_use }]),
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
		expect(
			evalSet.evalCases[0].conversation[0].intermediateData,
		).toBeUndefined();
	});

	it("empty-array expected_tool_use still includes intermediateData (control)", async () => {
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
});
