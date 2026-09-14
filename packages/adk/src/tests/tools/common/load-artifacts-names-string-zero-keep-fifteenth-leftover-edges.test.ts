import { describe, expect, it } from "vitest";
import { LoadArtifactsTool } from "../../../tools/common/load-artifacts-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

/**
 * Fifteenth leftover: runAsync uses `args.artifact_names || []` — string
 * "0" is truthy and kept; "" coalesces to []. Sixth covered falsy response
 * path only.
 */
describe("load-artifacts names string-zero keep fifteenth leftover", () => {
	it('artifact_names: "0" is truthy and returned as-is', async () => {
		const tool = new LoadArtifactsTool();
		await expect(
			tool.runAsync({ artifact_names: "0" as any }, makeContext()),
		).resolves.toEqual({ artifact_names: "0" });
	});

	it('artifact_names: "" coalesces to [] (control)', async () => {
		const tool = new LoadArtifactsTool();
		await expect(
			tool.runAsync({ artifact_names: "" as any }, makeContext()),
		).resolves.toEqual({ artifact_names: [] });
	});

	it("omitted artifact_names coalesces to [] (control)", async () => {
		const tool = new LoadArtifactsTool();
		await expect(tool.runAsync({} as any, makeContext())).resolves.toEqual({
			artifact_names: [],
		});
	});
});
