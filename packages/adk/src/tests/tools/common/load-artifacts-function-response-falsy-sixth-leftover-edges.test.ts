import { describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../../models/llm-request";
import { LoadArtifactsTool } from "../../../tools/common/load-artifacts-tool";
import type { ToolContext } from "../../../tools/tool-context";

describe("LoadArtifactsTool functionResponse falsy sixth leftover (post #151)", () => {
	it.each([
		{ label: "null", functionResponse: null },
		{ label: "false", functionResponse: false },
		{ label: "0", functionResponse: 0 },
		{ label: "empty-string", functionResponse: "" },
	] as const)("extractFunctionResponse treats falsy functionResponse ($label) as absent", async ({
		functionResponse,
	}) => {
		const tool = new LoadArtifactsTool();
		const loadArtifact = vi.fn();
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [{ functionResponse } as any],
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
		expect(llmRequest.config?.systemInstruction).toContain("a.txt");
	});

	it.each([
		{ label: "null", artifact_names: null },
		{ label: "false", artifact_names: false },
		{ label: "0", artifact_names: 0 },
		{ label: "empty-string", artifact_names: "" },
	] as const)("coalesces falsy response.artifact_names ($label) to [] so no loads occur", async ({
		artifact_names,
	}) => {
		const tool = new LoadArtifactsTool();
		const loadArtifact = vi.fn();
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "load_artifacts",
							response: { artifact_names },
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

	it("ignores load_artifacts-shaped parts when functionResponse key is missing", async () => {
		const tool = new LoadArtifactsTool();
		const loadArtifact = vi.fn();
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [{ text: "not a function response" } as any],
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
	});
});
