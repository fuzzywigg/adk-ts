import { describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../../models/llm-request";
import { LoadArtifactsTool } from "../../../tools/common/load-artifacts-tool";
import type { ToolContext } from "../../../tools/tool-context";

describe("LoadArtifactsTool fifth leftover — truthy || / falsy load / extract quirks", () => {
	const truthyNonArrays: Array<{ label: string; value: unknown }> = [
		{ label: "string hello", value: "hello" },
		{ label: "true", value: true },
		{ label: "number 1", value: 1 },
		{ label: "object", value: { a: 1 } },
		{ label: "string ab", value: "ab" },
	];

	for (const { label, value } of truthyNonArrays) {
		it(`runAsync preserves truthy non-array artifact_names (${label})`, async () => {
			const tool = new LoadArtifactsTool();
			await expect(
				tool.runAsync({ artifact_names: value as any }, {
					actions: {},
				} as ToolContext),
			).resolves.toEqual({ artifact_names: value });
		});
	}

	it("response.artifact_names string iterates characters as names", async () => {
		const tool = new LoadArtifactsTool();
		const loadArtifact = vi.fn().mockResolvedValue({ text: "x" });
		const appendInstructions = vi.fn();
		const contents: any[] = [
			{
				role: "model",
				parts: [
					{
						functionResponse: {
							name: "load_artifacts",
							response: { artifact_names: "ab" },
						},
					},
				],
			},
		];
		await tool.processLlmRequest(
			{
				actions: {},
				listArtifacts: vi.fn().mockResolvedValue(["a", "b"]),
				loadArtifact,
			} as unknown as ToolContext,
			{ appendInstructions, contents, toolsDict: {} } as unknown as LlmRequest,
		);
		expect(loadArtifact).toHaveBeenCalledWith("a");
		expect(loadArtifact).toHaveBeenCalledWith("b");
		expect(loadArtifact).toHaveBeenCalledTimes(2);
	});

	const truthyResponseNames: Array<{ label: string; value: unknown }> = [
		{ label: "true", value: true },
		{ label: "number 1", value: 1 },
		{ label: "object with length", value: { length: 0 } },
	];

	for (const { label, value } of truthyResponseNames) {
		it(`response.artifact_names truthy non-array (${label}) throws non-iterable into outer catch`, async () => {
			const tool = new LoadArtifactsTool();
			const loadArtifact = vi.fn();
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const contents: any[] = [
				{
					role: "model",
					parts: [
						{
							functionResponse: {
								name: "load_artifacts",
								response: { artifact_names: value },
							},
						},
					],
				},
			];
			await tool.processLlmRequest(
				{
					actions: {},
					listArtifacts: vi.fn().mockResolvedValue(["x"]),
					loadArtifact,
				} as unknown as ToolContext,
				{
					appendInstructions: vi.fn(),
					contents,
					toolsDict: {},
				} as unknown as LlmRequest,
			);
			expect(loadArtifact).not.toHaveBeenCalled();
			expect(errorSpy).toHaveBeenCalled();
			errorSpy.mockRestore();
		});
	}

	it("outer catch when response is null (throws on .artifact_names)", async () => {
		const tool = new LoadArtifactsTool();
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const contents: any[] = [
			{
				role: "model",
				parts: [
					{
						functionResponse: {
							name: "load_artifacts",
							response: null,
						},
					},
				],
			},
		];
		await tool.processLlmRequest(
			{
				actions: {},
				listArtifacts: vi.fn().mockResolvedValue(["x"]),
				loadArtifact: vi.fn(),
			} as unknown as ToolContext,
			{
				appendInstructions: vi.fn(),
				contents,
				toolsDict: {},
			} as unknown as LlmRequest,
		);
		expect(errorSpy).toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	const falsyArtifacts: Array<{ label: string; value: unknown }> = [
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: "empty string", value: "" },
	];

	for (const { label, value } of falsyArtifacts) {
		it(`skips loadArtifact result when falsy (${label})`, async () => {
			const tool = new LoadArtifactsTool();
			const loadArtifact = vi.fn().mockResolvedValue(value);
			const contents: any[] = [
				{
					role: "model",
					parts: [
						{
							functionResponse: {
								name: "load_artifacts",
								response: { artifact_names: ["skip.txt"] },
							},
						},
					],
				},
			];
			await tool.processLlmRequest(
				{
					actions: {},
					listArtifacts: vi.fn().mockResolvedValue(["skip.txt"]),
					loadArtifact,
				} as unknown as ToolContext,
				{
					appendInstructions: vi.fn(),
					contents,
					toolsDict: {},
				} as unknown as LlmRequest,
			);
			expect(loadArtifact).toHaveBeenCalledWith("skip.txt");
			expect(contents).toHaveLength(1);
		});
	}

	const falsyFunctionResponses: Array<{ label: string; value: unknown }> = [
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: "empty string", value: "" },
	];

	for (const { label, value } of falsyFunctionResponses) {
		it(`extractFunctionResponse ignores falsy functionResponse (${label})`, async () => {
			const tool = new LoadArtifactsTool();
			const loadArtifact = vi.fn();
			const contents: any[] = [
				{
					role: "model",
					parts: [{ functionResponse: value }],
				},
			];
			await tool.processLlmRequest(
				{
					actions: {},
					listArtifacts: vi.fn().mockResolvedValue(["a.txt"]),
					loadArtifact,
				} as unknown as ToolContext,
				{
					appendInstructions: vi.fn(),
					contents,
					toolsDict: {},
				} as unknown as LlmRequest,
			);
			expect(loadArtifact).not.toHaveBeenCalled();
		});
	}

	it("listArtifacts truthy string with length appends instructions", async () => {
		const tool = new LoadArtifactsTool();
		const appendInstructions = vi.fn();
		await tool.processLlmRequest(
			{
				actions: {},
				listArtifacts: vi.fn().mockResolvedValue("ab"),
			} as unknown as ToolContext,
			{
				appendInstructions,
				contents: [],
				toolsDict: {},
			} as unknown as LlmRequest,
		);
		expect(appendInstructions).toHaveBeenCalledTimes(1);
		expect(appendInstructions.mock.calls[0][0][0]).toContain(
			JSON.stringify("ab"),
		);
		expect(appendInstructions.mock.calls[0][0][0]).toContain("load_artifacts");
	});

	it("logs non-Error rejection from loadArtifact and continues", async () => {
		const tool = new LoadArtifactsTool();
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const loadArtifact = vi
			.fn()
			.mockRejectedValueOnce("boom-string")
			.mockResolvedValueOnce({ text: "ok" });
		const contents: any[] = [
			{
				role: "model",
				parts: [
					{
						functionResponse: {
							name: "load_artifacts",
							response: { artifact_names: ["bad", "good"] },
						},
					},
				],
			},
		];
		await tool.processLlmRequest(
			{
				actions: {},
				listArtifacts: vi.fn().mockResolvedValue(["bad", "good"]),
				loadArtifact,
			} as unknown as ToolContext,
			{
				appendInstructions: vi.fn(),
				contents,
				toolsDict: {},
			} as unknown as LlmRequest,
		);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining("Failed to load artifact bad"),
			"boom-string",
		);
		expect(contents).toHaveLength(2);
		expect(contents[1].parts[0].text).toBe("Artifact good is:");
		errorSpy.mockRestore();
	});

	it("skips appendInstructions when method missing but still lists artifacts", async () => {
		const tool = new LoadArtifactsTool();
		const llmRequest = {
			contents: [],
			toolsDict: {},
		} as unknown as LlmRequest;
		await expect(
			tool.processLlmRequest(
				{
					actions: {},
					listArtifacts: vi.fn().mockResolvedValue(["solo.txt"]),
				} as unknown as ToolContext,
				llmRequest,
			),
		).resolves.toBeUndefined();
	});
});
