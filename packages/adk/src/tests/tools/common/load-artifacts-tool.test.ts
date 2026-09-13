import { describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../../models/llm-request";
import { LoadArtifactsTool } from "../../../tools/common/load-artifacts-tool";
import type { ToolContext } from "../../../tools/tool-context";

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

	it("loads requested artifacts from a load_artifacts function response", async () => {
		const tool = new LoadArtifactsTool();
		const loadArtifact = vi
			.fn()
			.mockResolvedValueOnce({
				inlineData: { mimeType: "text/plain", data: "YQ==" },
			})
			.mockResolvedValueOnce(undefined);
		const context = {
			actions: {},
			listArtifacts: vi.fn().mockResolvedValue(["a.txt", "b.txt"]),
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

		expect(loadArtifact).toHaveBeenCalledWith("a.txt");
		expect(loadArtifact).toHaveBeenCalledWith("b.txt");
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some((p) => (p as any).text === "Artifact a.txt is:"),
			),
		).toBe(true);
	});

	it("swallows per-artifact load failures and listArtifacts errors", async () => {
		const tool = new LoadArtifactsTool();
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		const failingContext = {
			actions: {},
			listArtifacts: vi.fn().mockResolvedValue(["bad.bin"]),
			loadArtifact: vi.fn().mockRejectedValue(new Error("read fail")),
		} as unknown as ToolContext;
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "load_artifacts",
							response: { artifact_names: ["bad.bin"] },
						},
					} as any,
				],
			},
		];
		await tool.processLlmRequest(failingContext, llmRequest);
		expect(errorSpy).toHaveBeenCalled();

		const listFailContext = {
			actions: {},
			listArtifacts: vi.fn().mockRejectedValue(new Error("list fail")),
		} as unknown as ToolContext;
		await tool.processLlmRequest(listFailContext, new LlmRequest());
		expect(errorSpy).toHaveBeenCalled();

		errorSpy.mockRestore();
	});

	it("returns early when listArtifacts yields null or undefined", async () => {
		const tool = new LoadArtifactsTool();
		for (const empty of [null, undefined]) {
			const llmRequest = new LlmRequest();
			await tool.processLlmRequest(
				{
					actions: {},
					listArtifacts: vi.fn().mockResolvedValue(empty),
				} as unknown as ToolContext,
				llmRequest,
			);
			expect(llmRequest.config?.systemInstruction).toBeUndefined();
		}
	});

	it("appends instructions but skips attach loop for empty contents", async () => {
		const tool = new LoadArtifactsTool();
		const loadArtifact = vi.fn();
		const llmRequest = new LlmRequest();
		llmRequest.contents = [];

		await tool.processLlmRequest(
			{
				actions: {},
				listArtifacts: vi.fn().mockResolvedValue(["a.txt"]),
				loadArtifact,
			} as unknown as ToolContext,
			llmRequest,
		);

		expect(llmRequest.config?.systemInstruction).toContain("a.txt");
		expect(loadArtifact).not.toHaveBeenCalled();
	});

	it("skips attach when last content has empty parts", async () => {
		const tool = new LoadArtifactsTool();
		const loadArtifact = vi.fn();
		const llmRequest = new LlmRequest();
		llmRequest.contents = [{ role: "user", parts: [] }];

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

	it("ignores function responses that are not load_artifacts", async () => {
		const tool = new LoadArtifactsTool();
		const loadArtifact = vi.fn();
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

	it("ignores plain text last parts without functionResponse", async () => {
		const tool = new LoadArtifactsTool();
		const loadArtifact = vi.fn();
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{ role: "user", parts: [{ text: "please load files" }] },
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

	it("treats missing artifact_names in function response as empty list", async () => {
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
							response: {},
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

	it("continues loading after one artifact fails and attaches successes", async () => {
		const tool = new LoadArtifactsTool();
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const loadArtifact = vi
			.fn()
			.mockRejectedValueOnce(new Error("first fail"))
			.mockResolvedValueOnce({
				inlineData: { mimeType: "text/plain", data: "Yg==" },
			});
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "load_artifacts",
							response: { artifact_names: ["bad.txt", "good.txt"] },
						},
					} as any,
				],
			},
		];

		await tool.processLlmRequest(
			{
				actions: {},
				listArtifacts: vi.fn().mockResolvedValue(["bad.txt", "good.txt"]),
				loadArtifact,
			} as unknown as ToolContext,
			llmRequest,
		);

		expect(loadArtifact).toHaveBeenCalledTimes(2);
		expect(errorSpy).toHaveBeenCalled();
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some((p) => (p as any).text === "Artifact good.txt is:"),
			),
		).toBe(true);
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some((p) => (p as any).text === "Artifact bad.txt is:"),
			),
		).toBe(false);
		errorSpy.mockRestore();
	});

	it("does not attach when loadArtifact returns a falsy artifact", async () => {
		const tool = new LoadArtifactsTool();
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "load_artifacts",
							response: { artifact_names: ["missing.txt"] },
						},
					} as any,
				],
			},
		];

		await tool.processLlmRequest(
			{
				actions: {},
				listArtifacts: vi.fn().mockResolvedValue(["missing.txt"]),
				loadArtifact: vi.fn().mockResolvedValue(null),
			} as unknown as ToolContext,
			llmRequest,
		);

		expect(llmRequest.contents).toHaveLength(1);
	});
});
