import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../../models/llm-request";
import { LoadArtifactsTool } from "../../../tools/common/load-artifacts-tool";
import { LoadMemoryTool } from "../../../tools/common/load-memory-tool";
import type { ToolContext } from "../../../tools/tool-context";

describe("LoadMemoryTool fourth leftover matrices", () => {
	it("declaration locks load_memory schema", () => {
		const tool = new LoadMemoryTool();
		const declaration = tool.getDeclaration();
		expect(tool.name).toBe("load_memory");
		expect(tool.description).toContain("memory");
		expect(declaration.parameters?.type).toBe(Type.OBJECT);
		expect(declaration.parameters?.required).toEqual(["query"]);
		expect(declaration.parameters?.properties?.query).toEqual({
			type: Type.STRING,
			description: "The query to load memories for",
		});
	});

	const successMatrix: Array<{
		label: string;
		query: string;
		memories: unknown;
		expectedCount: number;
		expectedMemories: unknown[];
	}> = [
		{
			label: "empty memories",
			query: "q",
			memories: [],
			expectedCount: 0,
			expectedMemories: [],
		},
		{
			label: "single memory",
			query: "needle",
			memories: [{ text: "hit" }],
			expectedCount: 1,
			expectedMemories: [{ text: "hit" }],
		},
		{
			label: "three memories",
			query: "multi",
			memories: [{ a: 1 }, { a: 2 }, { a: 3 }],
			expectedCount: 3,
			expectedMemories: [{ a: 1 }, { a: 2 }, { a: 3 }],
		},
		{
			label: "empty query string",
			query: "",
			memories: [],
			expectedCount: 0,
			expectedMemories: [],
		},
		{
			label: "unicode query",
			query: "東京 天気",
			memories: [{ author: "u", content: { parts: [{ text: "sunny" }] } }],
			expectedCount: 1,
			expectedMemories: [
				{ author: "u", content: { parts: [{ text: "sunny" }] } },
			],
		},
		{
			label: "missing memories key coalesces to []",
			query: "missing",
			memories: undefined,
			expectedCount: 0,
			expectedMemories: [],
		},
		{
			label: "null memories coalesces to []",
			query: "nullish",
			memories: null,
			expectedCount: 0,
			expectedMemories: [],
		},
	];

	for (const row of successMatrix) {
		it(`search success: ${row.label}`, async () => {
			const tool = new LoadMemoryTool();
			const searchMemory = vi
				.fn()
				.mockResolvedValue(
					row.memories === undefined ? {} : { memories: row.memories },
				);
			const context = { actions: {}, searchMemory } as unknown as ToolContext;
			await expect(
				tool.runAsync({ query: row.query }, context),
			).resolves.toEqual({
				memories: row.expectedMemories,
				count: row.expectedCount,
			});
			expect(searchMemory).toHaveBeenCalledWith(row.query);
		});
	}

	it("error envelope for Error rejection", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockRejectedValue(new Error("offline"));
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			error: "Memory search failed",
			message: "offline",
		});
		expect(error).toHaveBeenCalled();
	});

	it("error envelope stringifies non-Error rejection", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockRejectedValue(404);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			error: "Memory search failed",
			message: "404",
		});
	});

	it("error envelope stringifies object rejection", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockRejectedValue({ reason: "down" });
		vi.spyOn(console, "error").mockImplementation(() => {});
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
			error: "Memory search failed",
			message: "[object Object]",
		});
	});

	it("logs debug with the query", async () => {
		const tool = new LoadMemoryTool();
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});
		const searchMemory = vi.fn().mockResolvedValue({ memories: [] });
		const context = { actions: {}, searchMemory } as unknown as ToolContext;
		await tool.runAsync({ query: "logged-query" }, context);
		expect(debug).toHaveBeenCalledWith(expect.stringContaining("logged-query"));
	});

	it("does not mutate context.actions on success", async () => {
		const tool = new LoadMemoryTool();
		const searchMemory = vi.fn().mockResolvedValue({ memories: [{ x: 1 }] });
		const context = {
			actions: { escalate: false },
			searchMemory,
		} as unknown as ToolContext;
		await tool.runAsync({ query: "q" }, context);
		expect(context.actions).toEqual({ escalate: false });
	});
});

describe("LoadArtifactsTool fourth leftover matrices", () => {
	it("declaration locks load_artifacts schema with empty required", () => {
		const tool = new LoadArtifactsTool();
		const declaration = tool.getDeclaration();
		expect(tool.name).toBe("load_artifacts");
		expect(tool.description).toContain("artifacts");
		expect(declaration.parameters?.type).toBe(Type.OBJECT);
		expect(declaration.parameters?.required).toEqual([]);
		expect(declaration.parameters?.properties?.artifact_names?.type).toBe(
			Type.ARRAY,
		);
		expect(declaration.parameters?.properties?.artifact_names?.items).toEqual({
			type: Type.STRING,
		});
	});

	const coalesceMatrix: Array<{
		label: string;
		args: { artifact_names?: string[] | null };
		expected: string[];
	}> = [
		{ label: "omitted args", args: {}, expected: [] },
		{
			label: "undefined names",
			args: { artifact_names: undefined },
			expected: [],
		},
		{ label: "empty array", args: { artifact_names: [] }, expected: [] },
		{
			label: "single name",
			args: { artifact_names: ["a.txt"] },
			expected: ["a.txt"],
		},
		{
			label: "multiple names",
			args: { artifact_names: ["a.txt", "b.bin", "c.json"] },
			expected: ["a.txt", "b.bin", "c.json"],
		},
		{
			label: "unicode names",
			args: { artifact_names: ["資料.pdf"] },
			expected: ["資料.pdf"],
		},
		{
			label: "empty string name preserved",
			args: { artifact_names: [""] },
			expected: [""],
		},
	];

	for (const { label, args, expected } of coalesceMatrix) {
		it(`runAsync coalesce: ${label}`, async () => {
			const tool = new LoadArtifactsTool();
			await expect(
				tool.runAsync(args as any, { actions: {} } as ToolContext),
			).resolves.toEqual({ artifact_names: expected });
		});
	}

	it("processLlmRequest no-ops when listArtifacts is empty", async () => {
		const tool = new LoadArtifactsTool();
		const appendInstructions = vi.fn();
		const llmRequest = {
			appendInstructions,
			contents: [],
			toolsDict: {},
		} as unknown as LlmRequest;
		const listArtifacts = vi.fn().mockResolvedValue([]);
		await tool.processLlmRequest(
			{ actions: {}, listArtifacts } as unknown as ToolContext,
			llmRequest,
		);
		expect(appendInstructions).not.toHaveBeenCalled();
	});

	it("processLlmRequest no-ops when listArtifacts returns nullish", async () => {
		const tool = new LoadArtifactsTool();
		const appendInstructions = vi.fn();
		const llmRequest = {
			appendInstructions,
			contents: [],
			toolsDict: {},
		} as unknown as LlmRequest;
		for (const value of [null, undefined]) {
			appendInstructions.mockClear();
			const listArtifacts = vi.fn().mockResolvedValue(value);
			await tool.processLlmRequest(
				{ actions: {}, listArtifacts } as unknown as ToolContext,
				llmRequest,
			);
			expect(appendInstructions).not.toHaveBeenCalled();
		}
	});

	it("processLlmRequest appends instructions when artifacts exist", async () => {
		const tool = new LoadArtifactsTool();
		const appendInstructions = vi.fn();
		const llmRequest = {
			appendInstructions,
			contents: [],
			toolsDict: {},
		} as unknown as LlmRequest;
		const listArtifacts = vi.fn().mockResolvedValue(["note.txt", "img.png"]);
		await tool.processLlmRequest(
			{ actions: {}, listArtifacts } as unknown as ToolContext,
			llmRequest,
		);
		expect(appendInstructions).toHaveBeenCalledTimes(1);
		const instructions = appendInstructions.mock.calls[0][0] as string[];
		expect(instructions[0]).toContain("note.txt");
		expect(instructions[0]).toContain("img.png");
		expect(instructions[0]).toContain("load_artifacts");
	});

	it("processLlmRequest loads artifacts when last content is load_artifacts response", async () => {
		const tool = new LoadArtifactsTool();
		const appendInstructions = vi.fn();
		const loadArtifact = vi.fn().mockImplementation(async (name: string) => ({
			inlineData: { data: `bytes-${name}`, mimeType: "text/plain" },
		}));
		const contents: any[] = [
			{
				role: "model",
				parts: [
					{
						functionResponse: {
							name: "load_artifacts",
							response: { artifact_names: ["a.txt", "b.txt"] },
						},
					},
				],
			},
		];
		const llmRequest = {
			appendInstructions,
			contents,
			toolsDict: {},
		} as unknown as LlmRequest;
		await tool.processLlmRequest(
			{
				actions: {},
				listArtifacts: vi.fn().mockResolvedValue(["a.txt", "b.txt"]),
				loadArtifact,
			} as unknown as ToolContext,
			llmRequest,
		);
		expect(loadArtifact).toHaveBeenCalledWith("a.txt");
		expect(loadArtifact).toHaveBeenCalledWith("b.txt");
		expect(contents).toHaveLength(3);
		expect(contents[1].parts[0].text).toBe("Artifact a.txt is:");
		expect(contents[2].parts[0].text).toBe("Artifact b.txt is:");
	});

	it("processLlmRequest skips null artifact loads", async () => {
		const tool = new LoadArtifactsTool();
		const contents: any[] = [
			{
				role: "model",
				parts: [
					{
						functionResponse: {
							name: "load_artifacts",
							response: { artifact_names: ["missing.txt"] },
						},
					},
				],
			},
		];
		const llmRequest = {
			appendInstructions: vi.fn(),
			contents,
			toolsDict: {},
		} as unknown as LlmRequest;
		await tool.processLlmRequest(
			{
				actions: {},
				listArtifacts: vi.fn().mockResolvedValue(["missing.txt"]),
				loadArtifact: vi.fn().mockResolvedValue(undefined),
			} as unknown as ToolContext,
			llmRequest,
		);
		expect(contents).toHaveLength(1);
	});

	it("processLlmRequest swallows listArtifacts errors", async () => {
		const tool = new LoadArtifactsTool();
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const appendInstructions = vi.fn();
		await tool.processLlmRequest(
			{
				actions: {},
				listArtifacts: vi.fn().mockRejectedValue(new Error("list failed")),
			} as unknown as ToolContext,
			{
				appendInstructions,
				contents: [],
				toolsDict: {},
			} as unknown as LlmRequest,
		);
		expect(appendInstructions).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalled();
	});

	it("processLlmRequest ignores non-load_artifacts function responses", async () => {
		const tool = new LoadArtifactsTool();
		const loadArtifact = vi.fn();
		const contents: any[] = [
			{
				role: "model",
				parts: [
					{
						functionResponse: {
							name: "other_tool",
							response: { artifact_names: ["a.txt"] },
						},
					},
				],
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
		expect(contents).toHaveLength(1);
	});

	it("runAsync returns a fresh object each call", async () => {
		const tool = new LoadArtifactsTool();
		const a = await tool.runAsync({ artifact_names: ["x"] }, {
			actions: {},
		} as ToolContext);
		const b = await tool.runAsync({ artifact_names: ["x"] }, {
			actions: {},
		} as ToolContext);
		expect(a).toEqual({ artifact_names: ["x"] });
		expect(b).toEqual({ artifact_names: ["x"] });
		expect(a).not.toBe(b);
	});
});
