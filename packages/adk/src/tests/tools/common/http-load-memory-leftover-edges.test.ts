import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../../models/llm-request";
import { HttpRequestTool } from "../../../tools/common/http-request-tool";
import { LoadArtifactsTool } from "../../../tools/common/load-artifacts-tool";
import { LoadMemoryTool } from "../../../tools/common/load-memory-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeHttpContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("HttpRequestTool leftover: default coalesces + error arms", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("defaults method/headers/timeout when args omit them", async () => {
		const tool = new HttpRequestTool();
		const timeoutSpy = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(AbortSignal.abort() as any);
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers({ "x-a": "1" }),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const result = await tool.runAsync(
			{ url: "https://example.com/default" },
			makeHttpContext(),
		);

		expect(timeoutSpy).toHaveBeenCalledWith(10000);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/default",
			expect.objectContaining({
				method: "GET",
				headers: {},
				body: undefined,
			}),
		);
		expect(result.statusCode).toBe(200);
		expect(result.body).toBe("ok");
		timeoutSpy.mockRestore();
	});

	it("does not treat explicit falsy-looking method strings as default GET", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 204,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com/x", method: "HEAD" },
			makeHttpContext(),
		);
		expect(fetchMock.mock.calls[0][1].method).toBe("HEAD");
	});

	const errorCases: Array<{
		label: string;
		reject: unknown;
		expected: string;
	}> = [
		{ label: "Error", reject: new Error("net down"), expected: "net down" },
		{ label: "string", reject: "plain fail", expected: "plain fail" },
		{ label: "number", reject: 42, expected: "42" },
		{
			label: "object",
			reject: { reason: "x" },
			expected: "[object Object]",
		},
		{ label: "null", reject: null, expected: "null" },
		{ label: "undefined", reject: undefined, expected: "undefined" },
	];

	for (const { label, reject, expected } of errorCases) {
		it(`catch arm stringifies ${label} rejections`, async () => {
			const tool = new HttpRequestTool();
			globalThis.fetch = vi.fn().mockRejectedValue(reject) as typeof fetch;
			const result = await tool.runAsync(
				{ url: "https://example.com/err" },
				makeHttpContext(),
			);
			expect(result).toEqual({
				statusCode: 0,
				headers: {},
				body: "",
				error: expected,
			});
		});
	}

	it("auto Content-Type only when body is valid JSON and header absent", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 201,
			headers: new Headers(),
			text: async () => "{}",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const matrix: Array<{
			label: string;
			body?: string;
			headers?: Record<string, string>;
			expectContentType?: string;
		}> = [
			{
				label: "json object body",
				body: '{"a":1}',
				expectContentType: "application/json",
			},
			{
				label: "json array body",
				body: "[1,2]",
				expectContentType: "application/json",
			},
			{ label: "non-json body", body: "plain text" },
			{ label: "empty body", body: "" },
			{ label: "no body" },
			{
				label: "json with explicit Content-Type",
				body: '{"a":1}',
				headers: { "Content-Type": "text/plain" },
				expectContentType: "text/plain",
			},
		];

		for (const row of matrix) {
			fetchMock.mockClear();
			await tool.runAsync(
				{
					url: "https://example.com/body",
					method: "POST",
					body: row.body,
					headers: row.headers,
				},
				makeHttpContext(),
			);
			const sentHeaders = fetchMock.mock.calls[0][1].headers as Record<
				string,
				string
			>;
			if (row.expectContentType) {
				expect(sentHeaders["Content-Type"]).toBe(row.expectContentType);
			} else {
				expect(sentHeaders["Content-Type"]).toBeUndefined();
			}
		}
	});

	it("returns structured error for invalid URL before fetch", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn();
		globalThis.fetch = fetchMock as typeof fetch;
		const result = await tool.runAsync({ url: "not-a-url" }, makeHttpContext());
		expect(fetchMock).not.toHaveBeenCalled();
		expect(result.statusCode).toBe(0);
		expect(result.error).toBeTruthy();
	});
});

describe("LoadMemoryTool leftover: memories || [] and length || 0", () => {
	const coalesceCases: Array<{
		label: string;
		payload: unknown;
		expectedMemories: unknown[];
		expectedCount: number;
	}> = [
		{
			label: "undefined memories",
			payload: {},
			expectedMemories: [],
			expectedCount: 0,
		},
		{
			label: "null memories",
			payload: { memories: null },
			expectedMemories: [],
			expectedCount: 0,
		},
		{
			label: "false memories",
			payload: { memories: false },
			expectedMemories: [],
			expectedCount: 0,
		},
		{
			label: "empty memories",
			payload: { memories: [] },
			expectedMemories: [],
			expectedCount: 0,
		},
		{
			label: "one memory",
			payload: { memories: [{ id: 1 }] },
			expectedMemories: [{ id: 1 }],
			expectedCount: 1,
		},
		{
			label: "three memories",
			payload: { memories: [1, 2, 3] },
			expectedMemories: [1, 2, 3],
			expectedCount: 3,
		},
	];

	for (const row of coalesceCases) {
		it(`coalesces ${row.label}`, async () => {
			const tool = new LoadMemoryTool();
			const searchMemory = vi.fn().mockResolvedValue(row.payload);
			const context = { actions: {}, searchMemory } as unknown as ToolContext;
			await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
				memories: row.expectedMemories,
				count: row.expectedCount,
			});
		});
	}

	const errorCases: Array<{ label: string; reject: unknown; message: string }> =
		[
			{
				label: "Error",
				reject: new Error("rag offline"),
				message: "rag offline",
			},
			{ label: "string", reject: "boom", message: "boom" },
			{ label: "number", reject: 7, message: "7" },
			{ label: "object", reject: { e: 1 }, message: "[object Object]" },
		];

	for (const { label, reject, message } of errorCases) {
		it(`catch arm maps ${label} rejection`, async () => {
			const tool = new LoadMemoryTool();
			const errorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => undefined);
			const context = {
				actions: {},
				searchMemory: vi.fn().mockRejectedValue(reject),
			} as unknown as ToolContext;
			await expect(tool.runAsync({ query: "q" }, context)).resolves.toEqual({
				error: "Memory search failed",
				message,
			});
			errorSpy.mockRestore();
		});
	}
});

describe("LoadArtifactsTool leftover: artifact_names || [] + load coalesce", () => {
	it("runAsync coalesces falsy artifact_names to []", async () => {
		const tool = new LoadArtifactsTool();
		const context = { actions: {} } as ToolContext;
		for (const artifact_names of [undefined, null, false, 0, ""] as const) {
			await expect(
				tool.runAsync({ artifact_names: artifact_names as any }, context),
			).resolves.toEqual({ artifact_names: [] });
		}
		await expect(
			tool.runAsync({ artifact_names: ["a"] }, context),
		).resolves.toEqual({ artifact_names: ["a"] });
	});

	it("skips instruction append when listArtifacts returns falsy/empty", async () => {
		const tool = new LoadArtifactsTool();
		for (const names of [null, undefined, [], false] as const) {
			const llmRequest = new LlmRequest();
			await tool.processLlmRequest(
				{
					actions: {},
					listArtifacts: vi.fn().mockResolvedValue(names),
				} as unknown as ToolContext,
				llmRequest,
			);
			expect(llmRequest.config?.systemInstruction).toBeUndefined();
		}
	});

	it("coalesces missing response.artifact_names to [] so no loads occur", async () => {
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
		expect(llmRequest.config?.systemInstruction).toContain("a.txt");
	});

	it("skips nullish loadArtifact results and continues remaining names", async () => {
		const tool = new LoadArtifactsTool();
		const loadArtifact = vi
			.fn()
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce({
				inlineData: { mimeType: "text/plain", data: "YQ==" },
			})
			.mockResolvedValueOnce(null);
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "load_artifacts",
							response: { artifact_names: ["miss", "hit", "nullish"] },
						},
					} as any,
				],
			},
		];
		await tool.processLlmRequest(
			{
				actions: {},
				listArtifacts: vi.fn().mockResolvedValue(["miss", "hit", "nullish"]),
				loadArtifact,
			} as unknown as ToolContext,
			llmRequest,
		);
		expect(loadArtifact).toHaveBeenCalledTimes(3);
		const artifactTexts = llmRequest.contents
			.flatMap((c) => c.parts ?? [])
			.map((p) => (p as any).text)
			.filter(Boolean);
		expect(artifactTexts).toContain("Artifact hit is:");
		expect(artifactTexts).not.toContain("Artifact miss is:");
		expect(artifactTexts).not.toContain("Artifact nullish is:");
	});

	it("swallows outer listArtifacts rejection via catch", async () => {
		const tool = new LoadArtifactsTool();
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const llmRequest = new LlmRequest();
		await tool.processLlmRequest(
			{
				actions: {},
				listArtifacts: vi.fn().mockRejectedValue(new Error("list fail")),
			} as unknown as ToolContext,
			llmRequest,
		);
		expect(llmRequest.config?.systemInstruction).toBeUndefined();
		errorSpy.mockRestore();
	});

	it("ignores non-load_artifacts function responses", async () => {
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
});
