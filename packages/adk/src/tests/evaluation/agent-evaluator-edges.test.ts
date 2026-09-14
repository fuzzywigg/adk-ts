import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentEvaluator } from "../../evaluation/agent-evaluator";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "adk-eval-edge-"));
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

describe("AgentEvaluator leftover edges (TOKENMAXX post #124)", () => {
	it("directory load wraps non-array JSON objects via Array.isArray map arm", async () => {
		const dir = await makeTempDir();
		await fs.writeFile(
			path.join(dir, "solo.test.json"),
			JSON.stringify({ query: "q", reference: "r" }),
		);

		const loaded = await (AgentEvaluator as any)._loadDataset(dir);
		expect(loaded).toEqual([[{ query: "q", reference: "r" }]]);
	});
});
