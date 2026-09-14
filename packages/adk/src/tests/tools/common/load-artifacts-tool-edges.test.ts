import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../../models/llm-request";
import { LoadArtifactsTool } from "../../../tools/common/load-artifacts-tool";
import type { ToolContext } from "../../../tools/tool-context";

describe("LoadArtifactsTool leftover edges", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("coalesces nullish artifact_names to an empty array", async () => {
		const tool = new LoadArtifactsTool();
		const context = { actions: {} } as ToolContext;
		await expect(
			tool.runAsync({ artifact_names: undefined }, context),
		).resolves.toEqual({ artifact_names: [] });
		await expect(
			tool.runAsync({ artifact_names: null as any }, context),
		).resolves.toEqual({ artifact_names: [] });
	});

	it("processLlmRequest no-ops when listArtifacts returns nullish", async () => {
		const tool = new LoadArtifactsTool();
		const listArtifacts = vi.fn().mockResolvedValue(null);
		const context = {
			actions: {},
			listArtifacts,
		} as unknown as ToolContext;
		const llmRequest = new LlmRequest();
		const appendSpy = vi.spyOn(llmRequest, "appendInstructions");

		await tool.processLlmRequest(context, llmRequest);
		expect(appendSpy).not.toHaveBeenCalled();
	});

	it("processLlmRequest no-ops when listArtifacts returns an empty array", async () => {
		const tool = new LoadArtifactsTool();
		const listArtifacts = vi.fn().mockResolvedValue([]);
		const context = {
			actions: {},
			listArtifacts,
		} as unknown as ToolContext;
		const llmRequest = new LlmRequest();
		const appendSpy = vi.spyOn(llmRequest, "appendInstructions");

		await tool.processLlmRequest(context, llmRequest);
		expect(appendSpy).not.toHaveBeenCalled();
	});

	it("swallows listArtifacts failures and logs without throwing", async () => {
		const tool = new LoadArtifactsTool();
		const listArtifacts = vi.fn().mockRejectedValue(new Error("boom"));
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const context = {
			actions: {},
			listArtifacts,
		} as unknown as ToolContext;
		const llmRequest = new LlmRequest();

		await expect(
			tool.processLlmRequest(context, llmRequest),
		).resolves.toBeUndefined();
		expect(error).toHaveBeenCalled();
	});

	it("loads requested artifacts from functionResponse and appends contents", async () => {
		const tool = new LoadArtifactsTool();
		const listArtifacts = vi.fn().mockResolvedValue(["a.txt"]);
		const loadArtifact = vi.fn().mockResolvedValue({ text: "payload" });
		const context = {
			actions: {},
			listArtifacts,
			loadArtifact,
		} as unknown as ToolContext;
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
				],
			},
		];

		await tool.processLlmRequest(context, llmRequest);
		expect(loadArtifact).toHaveBeenCalledWith("a.txt");
		expect(llmRequest.contents).toHaveLength(2);
		expect(llmRequest.contents?.[1].parts?.[0]).toEqual({
			text: "Artifact a.txt is:",
		});
		expect(llmRequest.contents?.[1].parts?.[1]).toEqual({ text: "payload" });
	});

	it("skips missing artifacts and continues loading the rest", async () => {
		const tool = new LoadArtifactsTool();
		const listArtifacts = vi.fn().mockResolvedValue(["a.txt", "b.txt"]);
		const loadArtifact = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ text: "b" });
		const context = {
			actions: {},
			listArtifacts,
			loadArtifact,
		} as unknown as ToolContext;
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "load_artifacts",
							response: { artifact_names: ["a.txt", "b.txt"] },
						},
					} as any,
				],
			},
		];

		await tool.processLlmRequest(context, llmRequest);
		expect(llmRequest.contents).toHaveLength(2);
		expect(llmRequest.contents?.[1].parts?.[0]).toEqual({
			text: "Artifact b.txt is:",
		});
	});

	it("logs and continues when loadArtifact throws for one name", async () => {
		const tool = new LoadArtifactsTool();
		const listArtifacts = vi.fn().mockResolvedValue(["a.txt", "b.txt"]);
		const loadArtifact = vi
			.fn()
			.mockRejectedValueOnce(new Error("missing"))
			.mockResolvedValueOnce({ text: "b" });
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const context = {
			actions: {},
			listArtifacts,
			loadArtifact,
		} as unknown as ToolContext;
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "load_artifacts",
							response: { artifact_names: ["a.txt", "b.txt"] },
						},
					} as any,
				],
			},
		];

		await tool.processLlmRequest(context, llmRequest);
		expect(error).toHaveBeenCalled();
		expect(llmRequest.contents).toHaveLength(2);
	});

	it("ignores function responses that are not load_artifacts", async () => {
		const tool = new LoadArtifactsTool();
		const listArtifacts = vi.fn().mockResolvedValue(["a.txt"]);
		const loadArtifact = vi.fn();
		const context = {
			actions: {},
			listArtifacts,
			loadArtifact,
		} as unknown as ToolContext;
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "other_tool",
							response: { artifact_names: ["a.txt"] },
						},
					} as any,
				],
			},
		];

		await tool.processLlmRequest(context, llmRequest);
		expect(loadArtifact).not.toHaveBeenCalled();
		expect(llmRequest.contents).toHaveLength(1);
	});

	it("defaults artifact_names inside functionResponse to an empty list", async () => {
		const tool = new LoadArtifactsTool();
		const listArtifacts = vi.fn().mockResolvedValue(["a.txt"]);
		const loadArtifact = vi.fn();
		const context = {
			actions: {},
			listArtifacts,
			loadArtifact,
		} as unknown as ToolContext;
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "load_artifacts",
							response: {},
						},
					} as any,
				],
			},
		];

		await tool.processLlmRequest(context, llmRequest);
		expect(loadArtifact).not.toHaveBeenCalled();
	});

	it("extractFunctionResponse returns null for parts without functionResponse", () => {
		const tool = new LoadArtifactsTool();
		expect((tool as any).extractFunctionResponse({ text: "hi" })).toBeNull();
		expect((tool as any).extractFunctionResponse({})).toBeNull();
		expect(
			(tool as any).extractFunctionResponse({
				functionResponse: { name: "load_artifacts", response: {} },
			}),
		).toEqual({ name: "load_artifacts", response: {} });
	});
});
