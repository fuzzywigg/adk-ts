import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Type } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../../models/llm-request";
import { ExitLoopTool } from "../../../tools/common/exit-loop-tool";
import { FileOperationsTool } from "../../../tools/common/file-operations-tool";
import { GetUserChoiceTool } from "../../../tools/common/get-user-choice-tool";
import { GoogleSearch } from "../../../tools/common/google-search";
import { HttpRequestTool } from "../../../tools/common/http-request-tool";
import { LoadArtifactsTool } from "../../../tools/common/load-artifacts-tool";
import { LoadMemoryTool } from "../../../tools/common/load-memory-tool";
import { TransferToAgentTool } from "../../../tools/common/transfer-to-agent-tool";
import { UserInteractionTool } from "../../../tools/common/user-interaction-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(actions: Record<string, unknown> = {}): ToolContext {
	return { actions } as ToolContext;
}

describe("common tools heavy matrix edges", () => {
	describe("FileOperationsTool", () => {
		let basePath: string;
		let tool: FileOperationsTool;

		beforeEach(async () => {
			basePath = await fs.mkdtemp(path.join(os.tmpdir(), "adk-file-heavy-"));
			tool = new FileOperationsTool({ basePath });
		});

		afterEach(async () => {
			await fs.rm(basePath, { recursive: true, force: true });
		});

		it("writes, reads, and appends file content", async () => {
			await tool.runAsync(
				{ operation: "write", filepath: "notes.txt", content: "hello" },
				makeContext(),
			);
			await tool.runAsync(
				{ operation: "append", filepath: "notes.txt", content: " world" },
				makeContext(),
			);
			await expect(
				tool.runAsync(
					{ operation: "read", filepath: "notes.txt" },
					makeContext(),
				),
			).resolves.toEqual({ success: true, data: "hello world" });
		});

		it("checks existence, lists directory, mkdir, and delete", async () => {
			await expect(
				tool.runAsync(
					{ operation: "exists", filepath: "missing.txt" },
					makeContext(),
				),
			).resolves.toEqual({ success: true, data: false });
			await tool.runAsync(
				{ operation: "write", filepath: "dir/a.txt", content: "a" },
				makeContext(),
			);
			await tool.runAsync(
				{ operation: "mkdir", filepath: "nested/dir" },
				makeContext(),
			);
			const listResult = await tool.runAsync(
				{ operation: "list", filepath: "dir" },
				makeContext(),
			);
			expect(listResult.success).toBe(true);
			expect(listResult.data).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: "a.txt", isFile: true }),
				]),
			);
			await tool.runAsync(
				{ operation: "delete", filepath: "dir/a.txt" },
				makeContext(),
			);
			await expect(
				tool.runAsync(
					{ operation: "exists", filepath: "dir/a.txt" },
					makeContext(),
				),
			).resolves.toEqual({ success: true, data: false });
		});

		it("returns error envelope for unsupported operations", async () => {
			const result = await tool.runAsync(
				{ operation: "chmod", filepath: "x" } as any,
				makeContext(),
			);
			expect(result.success).toBe(false);
			expect(result.error).toBeTruthy();
		});

		it("rejects path traversal outside basePath", async () => {
			const result = await tool.runAsync(
				{ operation: "read", filepath: "../escape.txt" },
				makeContext(),
			);
			expect(result.success).toBe(false);
		});
	});

	describe("HttpRequestTool", () => {
		const originalFetch = globalThis.fetch;

		afterEach(() => {
			globalThis.fetch = originalFetch;
			vi.restoreAllMocks();
		});

		it("defaults method to GET", async () => {
			const tool = new HttpRequestTool();
			const fetchMock = vi.fn().mockResolvedValue({
				status: 204,
				headers: new Headers(),
				text: async () => "",
			});
			globalThis.fetch = fetchMock as typeof fetch;
			await tool.runAsync({ url: "https://example.com/x" }, makeContext());
			expect(fetchMock.mock.calls[0][1].method).toBe("GET");
		});

		it("appends query params and returns status/body", async () => {
			const tool = new HttpRequestTool();
			const fetchMock = vi.fn().mockResolvedValue({
				status: 200,
				headers: new Headers({ "x-a": "1" }),
				text: async () => "ok",
			});
			globalThis.fetch = fetchMock as typeof fetch;
			const result = await tool.runAsync(
				{
					url: "https://example.com/search",
					params: { q: "adk", page: "2" },
				},
				makeContext(),
			);
			const calledUrl = String(fetchMock.mock.calls[0][0]);
			expect(calledUrl).toContain("q=adk");
			expect(calledUrl).toContain("page=2");
			expect(result).toMatchObject({ statusCode: 200, body: "ok" });
		});

		it("sets Content-Type for JSON bodies unless already provided", async () => {
			const tool = new HttpRequestTool();
			const fetchMock = vi.fn().mockResolvedValue({
				status: 200,
				headers: new Headers(),
				text: async () => "ok",
			});
			globalThis.fetch = fetchMock as typeof fetch;
			await tool.runAsync(
				{ url: "https://example.com/json", method: "POST", body: '{"a":1}' },
				makeContext(),
			);
			expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe(
				"application/json",
			);
		});

		it("stringifies non-Error fetch failures", async () => {
			const tool = new HttpRequestTool();
			globalThis.fetch = vi.fn().mockRejectedValue("network-down") as any;
			await expect(
				tool.runAsync({ url: "https://example.com" }, makeContext()),
			).resolves.toEqual({
				statusCode: 0,
				headers: {},
				body: "",
				error: "network-down",
			});
		});
	});

	describe("LoadArtifactsTool", () => {
		it("exposes load_artifacts metadata and returns artifact_names", async () => {
			const tool = new LoadArtifactsTool();
			expect(tool.name).toBe("load_artifacts");
			expect(tool.getDeclaration().parameters?.properties).toHaveProperty(
				"artifact_names",
			);
			await expect(
				tool.runAsync({ artifact_names: ["a.txt"] }, makeContext()),
			).resolves.toEqual({ artifact_names: ["a.txt"] });
			await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
				artifact_names: [],
			});
		});

		it("coalesces nullish artifact_names to empty array", async () => {
			const tool = new LoadArtifactsTool();
			await expect(
				tool.runAsync({ artifact_names: undefined }, makeContext()),
			).resolves.toEqual({ artifact_names: [] });
			await expect(
				tool.runAsync({ artifact_names: null as any }, makeContext()),
			).resolves.toEqual({ artifact_names: [] });
		});

		it("processLlmRequest appends instructions when artifacts exist", async () => {
			const tool = new LoadArtifactsTool();
			const listArtifacts = vi.fn().mockResolvedValue(["report.pdf"]);
			const llmRequest = new LlmRequest();
			await tool.processLlmRequest(
				{ actions: {}, listArtifacts } as unknown as ToolContext,
				llmRequest,
			);
			expect(llmRequest.config?.systemInstruction).toContain("report.pdf");
			expect(llmRequest.toolsDict.load_artifacts).toBe(tool);
		});

		it("processLlmRequest no-ops for empty artifact lists", async () => {
			const tool = new LoadArtifactsTool();
			const listArtifacts = vi.fn().mockResolvedValue([]);
			const llmRequest = new LlmRequest();
			const appendSpy = vi.spyOn(llmRequest, "appendInstructions");
			await tool.processLlmRequest(
				{ actions: {}, listArtifacts } as unknown as ToolContext,
				llmRequest,
			);
			expect(appendSpy).not.toHaveBeenCalled();
		});
	});

	describe("UserInteractionTool", () => {
		it("exposes user_interaction metadata as long-running", () => {
			const tool = new UserInteractionTool();
			expect(tool.name).toBe("user_interaction");
			expect(tool.isLongRunning).toBe(true);
			expect(tool.getDeclaration().parameters?.required).toEqual(["prompt"]);
		});

		it("returns error when promptUser is unavailable", async () => {
			const tool = new UserInteractionTool();
			await expect(
				tool.runAsync({ prompt: "What is your name?" }, makeContext()),
			).resolves.toEqual({
				success: false,
				error: "User interaction is not supported in the current environment",
			});
		});

		it("prompts the user and skips summarization", async () => {
			const tool = new UserInteractionTool();
			const promptUser = vi.fn().mockResolvedValue("Alice");
			const skipSummarization = vi.fn();
			const context = {
				actions: { promptUser, skipSummarization },
			} as unknown as ToolContext;
			const result = await tool.runAsync(
				{
					prompt: "What is your name?",
					defaultValue: "Guest",
					options: ["Alice", "Bob"],
				},
				context,
			);
			expect(skipSummarization).toHaveBeenCalledWith(true);
			expect(promptUser).toHaveBeenCalledWith({
				prompt: "What is your name?",
				defaultValue: "Guest",
				options: { choices: ["Alice", "Bob"] },
			});
			expect(result).toEqual({
				success: true,
				userInput: "Alice",
			});
		});
	});

	describe("GoogleSearch", () => {
		it("exposes google_search metadata and required query", () => {
			const tool = new GoogleSearch();
			expect(tool.name).toBe("google_search");
			const declaration = tool.getDeclaration();
			expect(declaration.parameters?.type).toBe(Type.OBJECT);
			expect(declaration.parameters?.required).toEqual(["query"]);
		});

		it("returns exactly two mock results embedding the query", async () => {
			const tool = new GoogleSearch();
			const result = await tool.runAsync(
				{ query: "adk typescript", num_results: 10 },
				makeContext(),
			);
			expect(result.results).toHaveLength(2);
			expect(result.results[0].title).toContain("adk typescript");
			expect(result.results[0].link).toBe("https://example.com/1");
		});

		it("embeds empty query into titles and snippets", async () => {
			const tool = new GoogleSearch();
			const result = await tool.runAsync({ query: "" }, makeContext());
			expect(result.results[0].title).toBe("Result 1 for ");
			expect(result.results[0].snippet).toContain('""');
		});
	});

	describe("ExitLoopTool", () => {
		it("exposes exit_loop metadata and a null declaration", () => {
			const tool = new ExitLoopTool();
			expect(tool.name).toBe("exit_loop");
			expect(tool.getDeclaration()).toBeNull();
		});

		it("sets escalate true and returns undefined", async () => {
			const tool = new ExitLoopTool();
			const context = makeContext();
			await expect(tool.runAsync({}, context)).resolves.toBeUndefined();
			expect(context.actions.escalate).toBe(true);
		});

		it("does not clear transferToAgent when escalating", async () => {
			const tool = new ExitLoopTool();
			const context = makeContext({ transferToAgent: "other" });
			await tool.runAsync({}, context);
			expect(context.actions.escalate).toBe(true);
			expect(context.actions.transferToAgent).toBe("other");
		});

		it("ignores unexpected args while still escalating", async () => {
			const tool = new ExitLoopTool();
			const context = makeContext();
			await tool.runAsync({ reason: "done", force: true }, context);
			expect(context.actions.escalate).toBe(true);
		});
	});

	describe("GetUserChoiceTool", () => {
		it("exposes get_user_choice as long-running with options required", () => {
			const tool = new GetUserChoiceTool();
			expect(tool.name).toBe("get_user_choice");
			expect(tool.isLongRunning).toBe(true);
			expect(tool.getDeclaration().parameters?.required).toEqual(["options"]);
		});

		it("returns null and sets skipSummarization", async () => {
			const tool = new GetUserChoiceTool();
			const context = makeContext();
			await expect(
				tool.runAsync({ options: ["a", "b"], question: "pick" }, context),
			).resolves.toBeNull();
			expect(context.actions.skipSummarization).toBe(true);
		});

		it("still returns null for empty options arrays", async () => {
			const tool = new GetUserChoiceTool();
			const context = makeContext();
			await expect(tool.runAsync({ options: [] }, context)).resolves.toBeNull();
			expect(context.actions.skipSummarization).toBe(true);
		});
	});

	describe("LoadMemoryTool", () => {
		it("exposes load_memory with required query", () => {
			const tool = new LoadMemoryTool();
			expect(tool.name).toBe("load_memory");
			expect(tool.getDeclaration().parameters?.required).toEqual(["query"]);
		});

		it("forwards query to searchMemory and returns memories with count", async () => {
			const tool = new LoadMemoryTool();
			const searchMemory = vi.fn().mockResolvedValue({
				memories: [{ text: "hit" }],
			});
			const context = { actions: {}, searchMemory } as unknown as ToolContext;
			await expect(
				tool.runAsync({ query: "needle" }, context),
			).resolves.toEqual({ memories: [{ text: "hit" }], count: 1 });
		});

		it("returns error envelope when searchMemory rejects", async () => {
			const tool = new LoadMemoryTool();
			const searchMemory = vi.fn().mockRejectedValue(new Error("offline"));
			vi.spyOn(console, "error").mockImplementation(() => {});
			const context = { actions: {}, searchMemory } as unknown as ToolContext;
			await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
				error: "Memory search failed",
				message: "offline",
			});
		});

		it("defaults missing memories arrays to empty with count 0", async () => {
			const tool = new LoadMemoryTool();
			const searchMemory = vi.fn().mockResolvedValue({});
			const context = { actions: {}, searchMemory } as unknown as ToolContext;
			await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
				memories: [],
				count: 0,
			});
		});
	});

	describe("TransferToAgentTool", () => {
		it("declares a single required agent_name string parameter", () => {
			const tool = new TransferToAgentTool();
			const declaration = tool.getDeclaration();
			expect(declaration.name).toBe("transfer_to_agent");
			expect(declaration.parameters?.required).toEqual(["agent_name"]);
			expect(declaration.parameters?.properties?.agent_name?.type).toBe(
				Type.STRING,
			);
		});

		it("sets transferToAgent and returns undefined", async () => {
			const tool = new TransferToAgentTool();
			const context = makeContext();
			await expect(
				tool.runAsync({ agent_name: "researcher" }, context),
			).resolves.toBeUndefined();
			expect(context.actions.transferToAgent).toBe("researcher");
		});

		it("overwrites prior transfer targets without clearing other flags", async () => {
			const tool = new TransferToAgentTool();
			const context = makeContext({
				transferToAgent: "old",
				escalate: true,
				skipSummarization: true,
			});
			await tool.runAsync({ agent_name: "new" }, context);
			expect(context.actions.transferToAgent).toBe("new");
			expect(context.actions.escalate).toBe(true);
			expect(context.actions.skipSummarization).toBe(true);
		});

		it("accepts empty-string agent names as the transfer target", async () => {
			const tool = new TransferToAgentTool();
			const context = makeContext();
			await tool.runAsync({ agent_name: "" }, context);
			expect(context.actions.transferToAgent).toBe("");
		});
	});
});
