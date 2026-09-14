import { describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../../models/llm-request";
import { LoadArtifactsTool } from "../../../tools/common/load-artifacts-tool";
import type { ToolContext } from "../../../tools/tool-context";

/**
 * Eleventh leftover: functionResponse.name === "load_artifacts" is
 * case-sensitive. Near-miss names skip loadArtifact even when the payload
 * looks like a load_artifacts response.
 */
describe("LoadArtifactsTool functionResponse.name case eleventh leftover", () => {
	async function processWithName(name: string, loadArtifact = vi.fn()) {
		const tool = new LoadArtifactsTool();
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							name,
							response: { artifact_names: ["a.txt"] },
						},
					} as any,
				],
			},
		];
		await tool.processLlmRequest(
			{
				actions: {},
				listArtifacts: vi.fn().mockResolvedValue(["a.txt"]),
				loadArtifact,
			} as unknown as ToolContext,
			llmRequest,
		);
		return { loadArtifact, llmRequest };
	}

	it.each([
		"Load_Artifacts",
		"LOAD_ARTIFACTS",
		"load_Artifacts",
		"load_artifacts ",
		" load_artifacts",
		"load-artifacts",
		"LoadArtifacts",
	])("ignores near-miss functionResponse.name %j", async (name) => {
		const { loadArtifact, llmRequest } = await processWithName(name);
		expect(loadArtifact).not.toHaveBeenCalled();
		expect(llmRequest.contents).toHaveLength(1);
	});

	it("exact load_artifacts still loads the requested artifact", async () => {
		const loadArtifact = vi.fn().mockResolvedValue({ text: "blob" });
		const { llmRequest } = await processWithName(
			"load_artifacts",
			loadArtifact,
		);
		expect(loadArtifact).toHaveBeenCalledWith("a.txt");
		expect(llmRequest.contents).toHaveLength(2);
		expect(llmRequest.contents?.[1].parts?.[0]).toEqual({
			text: "Artifact a.txt is:",
		});
	});
});
