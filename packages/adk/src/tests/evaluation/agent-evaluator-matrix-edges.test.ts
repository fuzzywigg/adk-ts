import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentEvaluator } from "../../evaluation/agent-evaluator";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "adk-eval-matrix-"));
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

describe("AgentEvaluator._loadDataset directory matrix edges", () => {
	it("wraps non-array JSON objects found under a directory", async () => {
		const dir = await makeTempDir();
		const nested = path.join(dir, "nested");
		await fs.mkdir(nested);

		await fs.writeFile(
			path.join(dir, "object.test.json"),
			JSON.stringify({
				query: "solo-object",
				reference: "r1",
				expected_tool_use: [],
			}),
		);
		await fs.writeFile(
			path.join(nested, "array.test.json"),
			JSON.stringify([
				{ query: "array-row", reference: "r2", expected_tool_use: [] },
			]),
		);
		await fs.writeFile(
			path.join(dir, "another-object.test.json"),
			JSON.stringify({
				query: "second-object",
				reference: "r3",
				expected_tool_use: [],
			}),
		);

		const loaded = await (AgentEvaluator as any)._loadDataset(dir);
		expect(loaded).toHaveLength(3);

		const queries = loaded
			.flat()
			.map((row: { query: string }) => row.query)
			.sort();
		expect(queries).toEqual(["array-row", "second-object", "solo-object"]);

		const objectRows = loaded.filter(
			(row: unknown[]) =>
				row.length === 1 && (row[0] as { query: string }).query !== "array-row",
		);
		expect(objectRows).toHaveLength(2);
		for (const row of objectRows) {
			expect(Array.isArray(row)).toBe(true);
			expect(row).toHaveLength(1);
		}
	});

	it.each([
		{
			label: "plain object",
			payload: { query: "q", reference: "r", expected_tool_use: [] },
		},
		{
			label: "nested object with metadata",
			payload: {
				query: "meta",
				reference: "r",
				expected_tool_use: [],
				meta: { suite: "matrix" },
			},
		},
	])("directory branch wraps $label the same as a single-row dataset", async ({
		payload,
	}) => {
		const dir = await makeTempDir();
		await fs.writeFile(
			path.join(dir, "case.test.json"),
			JSON.stringify(payload),
		);

		const loaded = await (AgentEvaluator as any)._loadDataset(dir);
		expect(loaded).toEqual([[payload]]);
	});
});
