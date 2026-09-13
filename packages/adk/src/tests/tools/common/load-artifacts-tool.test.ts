import { describe, expect, it, vi } from "vitest";
import { LoadArtifactsTool } from "../../../tools/common/load-artifacts-tool";
import type { ToolContext } from "../../../tools/tool-context";
import { LlmRequest } from "../../../models/llm-request";

describe("LoadArtifactsTool", () => {
	it("exposes load_artifacts metadata", () => {
		const tool = new LoadArtifactsTool();
		const declaration = tool.getDeclaration();

		expect(tool.name).toBe("load_artifacts");
		expect(tool.description).toContain("artifacts");
		expect(declaration.name).toBe("load_artifacts");
		expect(declaration.parameters?.properties).toHaveProperty("artifact_names");
	});

	it("returns artifact_names from runAsync", async () => {
		const tool = new LoadArtifactsTool();
		const context = { actions: {} } as ToolContext;

		await expect(
			tool.runAsync({ artifact_names: ["a.txt", "b.bin"] }, context),
		).resolves.toEqual({ artifact_names: ["a.txt", "b.bin"] });

		await expect(tool.runAsync({}, context)).resolves.toEqual({
			artifact_names: [],
		});
	});

	it("appends instructions when listArtifacts returns names", async () => {
		const tool = new LoadArtifactsTool();
		const listArtifacts = vi
			.fn()
			.mockResolvedValue(["report.pdf", "data.json"]);
		const context = {
			actions: {},
			listArtifacts,
		} as unknown as ToolContext;
		const llmRequest = new LlmRequest();

		await tool.processLlmRequest(context, llmRequest);

		expect(listArtifacts).toHaveBeenCalled();
		expect(llmRequest.config?.systemInstruction).toContain("report.pdf");
		expect(llmRequest.config?.systemInstruction).toContain("data.json");
		expect(llmRequest.config?.systemInstruction).toContain("load_artifacts");
		expect(llmRequest.toolsDict.load_artifacts).toBe(tool);
	});

	it("does not append instructions when there are no artifacts", async () => {
		const tool = new LoadArtifactsTool();
		const context = {
			actions: {},
			listArtifacts: vi.fn().mockResolvedValue([]),
		} as unknown as ToolContext;
		const llmRequest = new LlmRequest();

		await tool.processLlmRequest(context, llmRequest);

		expect(llmRequest.config?.systemInstruction).toBeUndefined();
	});
});
