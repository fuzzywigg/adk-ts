import { describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../../models/llm-request";
import { LoadArtifactsTool } from "../../../tools/common/load-artifacts-tool";
import type { ToolContext } from "../../../tools/tool-context";

/**
 * Fifteenth leftover: processLlmRequest only reads `lastContent.parts[0]`.
 * A load_artifacts functionResponse on parts[1+] is ignored (models fifteenth
 * parts[0]-only mirror).
 */
describe("load-artifacts parts index-zero only fifteenth leftover", () => {
	it("FR only on parts[1] never calls loadArtifact", async () => {
		const tool = new LoadArtifactsTool();
		const loadArtifact = vi.fn().mockResolvedValue({ text: "blob" });
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [
					{ text: "prefix" },
					{
						functionResponse: {
							name: "load_artifacts",
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
		expect(loadArtifact).not.toHaveBeenCalled();
		expect(llmRequest.contents).toHaveLength(1);
	});

	it("FR on parts[0] still loads (control)", async () => {
		const tool = new LoadArtifactsTool();
		const loadArtifact = vi.fn().mockResolvedValue({ text: "blob" });
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "load_artifacts",
							response: { artifact_names: ["a.txt"] },
						},
					} as any,
					{ text: "trailing ignored for FR extract" },
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
		expect(loadArtifact).toHaveBeenCalledWith("a.txt");
		expect(llmRequest.contents!.length).toBeGreaterThan(1);
	});
});
