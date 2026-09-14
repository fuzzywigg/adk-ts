import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentEvaluator } from "../../evaluation/agent-evaluator";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "adk-eval-leftover-"));
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

describe("AgentEvaluator._loadDataset directory wrap leftover edges", () => {
	it("wraps a non-array JSON object file in a directory into [object]", async () => {
		const dir = await makeTempDir();
		await fs.writeFile(
			path.join(dir, "single.test.json"),
			JSON.stringify({ query: "solo", reference: "r" }),
		);

		const dataset = await (AgentEvaluator as any)._loadDataset(dir);
		expect(dataset).toEqual([[{ query: "solo", reference: "r" }]]);
	});

	it("mixes array and object JSON files under a directory", async () => {
		const dir = await makeTempDir();
		await fs.writeFile(
			path.join(dir, "array.test.json"),
			JSON.stringify([{ query: "a1" }, { query: "a2" }]),
		);
		await fs.writeFile(
			path.join(dir, "object.test.json"),
			JSON.stringify({ query: "obj" }),
		);

		const dataset = await (AgentEvaluator as any)._loadDataset(dir);
		expect(dataset).toHaveLength(2);

		const flatQueries = dataset
			.flat()
			.map((row: { query: string }) => row.query)
			.sort();
		expect(flatQueries).toEqual(["a1", "a2", "obj"]);

		const wrapped = dataset.find(
			(sample: unknown[]) =>
				sample.length === 1 && (sample[0] as any).query === "obj",
		);
		expect(wrapped).toEqual([{ query: "obj" }]);

		const arraySample = dataset.find(
			(sample: unknown[]) =>
				sample.length === 2 && (sample[0] as any).query === "a1",
		);
		expect(arraySample).toEqual([{ query: "a1" }, { query: "a2" }]);
	});

	it("discovers nested subdirectory .test.json files recursively", async () => {
		const dir = await makeTempDir();
		const nested = path.join(dir, "level1", "level2");
		await fs.mkdir(nested, { recursive: true });
		await fs.writeFile(
			path.join(dir, "root.test.json"),
			JSON.stringify({ query: "root-obj" }),
		);
		await fs.writeFile(
			path.join(nested, "deep.test.json"),
			JSON.stringify([{ query: "deep-arr" }]),
		);
		await fs.writeFile(
			path.join(dir, "ignored.json"),
			JSON.stringify({ query: "nope" }),
		);

		const dataset = await (AgentEvaluator as any)._loadDataset(dir);
		expect(dataset).toHaveLength(2);
		const queries = dataset
			.flat()
			.map((row: { query: string }) => row.query)
			.sort();
		expect(queries).toEqual(["deep-arr", "root-obj"]);
	});

	it("returns empty array for an empty directory", async () => {
		const dir = await makeTempDir();
		const dataset = await (AgentEvaluator as any)._loadDataset(dir);
		expect(dataset).toEqual([]);
	});

	it("returns empty when directory has no .test.json files", async () => {
		const dir = await makeTempDir();
		await fs.writeFile(path.join(dir, "notes.json"), JSON.stringify([1]));
		await fs.mkdir(path.join(dir, "subdir"));
		await fs.writeFile(
			path.join(dir, "subdir", "also.json"),
			JSON.stringify({ query: "x" }),
		);

		const dataset = await (AgentEvaluator as any)._loadDataset(dir);
		expect(dataset).toEqual([]);
	});

	const wrapMatrix: Array<{
		label: string;
		payload: unknown;
		expected: unknown[][];
	}> = [
		{
			label: "plain object",
			payload: { query: "q", reference: "r" },
			expected: [[{ query: "q", reference: "r" }]],
		},
		{
			label: "nested object",
			payload: { query: "n", meta: { a: 1 } },
			expected: [[{ query: "n", meta: { a: 1 } }]],
		},
		{
			label: "string primitive JSON",
			payload: "just-a-string",
			expected: [["just-a-string"]],
		},
		{
			label: "number primitive JSON",
			payload: 7,
			expected: [[7]],
		},
		{
			label: "already array stays array",
			payload: [{ query: "keep" }],
			expected: [[{ query: "keep" }]],
		},
		{
			label: "empty object wrap",
			payload: {},
			expected: [[{}]],
		},
	];

	for (const { label, payload, expected } of wrapMatrix) {
		it(`directory wrap matrix: ${label}`, async () => {
			const dir = await makeTempDir();
			await fs.writeFile(
				path.join(dir, "case.test.json"),
				JSON.stringify(payload),
			);
			const dataset = await (AgentEvaluator as any)._loadDataset(dir);
			expect(dataset).toEqual(expected);
		});
	}

	it("wraps multiple non-array files independently", async () => {
		const dir = await makeTempDir();
		await fs.writeFile(
			path.join(dir, "a.test.json"),
			JSON.stringify({ query: "a" }),
		);
		await fs.writeFile(
			path.join(dir, "b.test.json"),
			JSON.stringify({ query: "b" }),
		);
		await fs.writeFile(
			path.join(dir, "c.test.json"),
			JSON.stringify({ query: "c", reference: "cr" }),
		);

		const dataset = await (AgentEvaluator as any)._loadDataset(dir);
		expect(dataset).toHaveLength(3);
		for (const sample of dataset) {
			expect(Array.isArray(sample)).toBe(true);
			expect(sample).toHaveLength(1);
			expect(typeof sample[0]).toBe("object");
		}
	});
});
