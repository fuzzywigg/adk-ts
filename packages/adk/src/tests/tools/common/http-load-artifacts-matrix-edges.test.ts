import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequestTool } from "../../../tools/common/http-request-tool";
import { LoadArtifactsTool } from "../../../tools/common/load-artifacts-tool";
import { LlmRequest } from "../../../models/llm-request";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("HttpRequestTool matrix leftover edges", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
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

	it("appends multiple query params", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;
		await tool.runAsync(
			{
				url: "https://example.com/search",
				params: { q: "adk", page: "2" },
			},
			makeContext(),
		);
		const calledUrl = String(fetchMock.mock.calls[0][0]);
		expect(calledUrl).toContain("q=adk");
		expect(calledUrl).toContain("page=2");
	});

	it("sets Content-Type for JSON bodies only when not already provided", async () => {
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

		fetchMock.mockClear();
		await tool.runAsync(
			{
				url: "https://example.com/json",
				method: "POST",
				headers: { "Content-Type": "application/vnd.custom+json" },
				body: '{"a":1}',
			},
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe(
			"application/vnd.custom+json",
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

	it("supports HEAD and OPTIONS without a body", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;
		for (const method of ["HEAD", "OPTIONS"] as const) {
			fetchMock.mockClear();
			await tool.runAsync(
				{ url: "https://example.com", method },
				makeContext(),
			);
			expect(fetchMock.mock.calls[0][1].method).toBe(method);
		}
	});
});

describe("LoadArtifactsTool matrix leftover edges", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("coalesces nullish artifact_names to an empty array", async () => {
		const tool = new LoadArtifactsTool();
		await expect(
			tool.runAsync({ artifact_names: undefined }, makeContext()),
		).resolves.toEqual({ artifact_names: [] });
		await expect(
			tool.runAsync({ artifact_names: null as any }, makeContext()),
		).resolves.toEqual({ artifact_names: [] });
	});

	it("processLlmRequest no-ops for nullish or empty artifact lists", async () => {
		const tool = new LoadArtifactsTool();
		for (const names of [null, []]) {
			const listArtifacts = vi.fn().mockResolvedValue(names);
			const llmRequest = new LlmRequest();
			const appendSpy = vi.spyOn(llmRequest, "appendInstructions");
			await tool.processLlmRequest(
				{ actions: {}, listArtifacts } as unknown as ToolContext,
				llmRequest,
			);
			expect(appendSpy).not.toHaveBeenCalled();
		}
	});

	it("loads requested artifacts from functionResponse and appends contents", async () => {
		const tool = new LoadArtifactsTool();
		const listArtifacts = vi.fn().mockResolvedValue(["a.txt"]);
		const loadArtifact = vi.fn().mockResolvedValue({ text: "payload" });
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
		await tool.processLlmRequest(
			{ actions: {}, listArtifacts, loadArtifact } as unknown as ToolContext,
			llmRequest,
		);
		expect(loadArtifact).toHaveBeenCalledWith("a.txt");
		expect(llmRequest.contents).toHaveLength(2);
		expect(llmRequest.contents?.[1].parts?.[0]).toEqual({
			text: "Artifact a.txt is:",
		});
	});

	it("skips missing artifacts and continues loading the rest", async () => {
		const tool = new LoadArtifactsTool();
		const listArtifacts = vi.fn().mockResolvedValue(["a.txt", "b.txt"]);
		const loadArtifact = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ text: "b" });
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
		await tool.processLlmRequest(
			{ actions: {}, listArtifacts, loadArtifact } as unknown as ToolContext,
			llmRequest,
		);
		expect(llmRequest.contents).toHaveLength(2);
		expect(llmRequest.contents?.[1].parts?.[0]).toEqual({
			text: "Artifact b.txt is:",
		});
	});

	it("ignores function responses that are not load_artifacts", async () => {
		const tool = new LoadArtifactsTool();
		const listArtifacts = vi.fn().mockResolvedValue(["a.txt"]);
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
			{ actions: {}, listArtifacts, loadArtifact } as unknown as ToolContext,
			llmRequest,
		);
		expect(loadArtifact).not.toHaveBeenCalled();
		expect(llmRequest.contents).toHaveLength(1);
	});
});
