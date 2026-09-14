import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { GoogleSearch } from "../../../tools/common/google-search";
import { HttpRequestTool } from "../../../tools/common/http-request-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("HttpRequestTool heavy matrix leftover edges", () => {
	it("declares url as required with method enum defaults", () => {
		const tool = new HttpRequestTool();
		const declaration = tool.getDeclaration();
		expect(tool.name).toBe("http_request");
		expect(declaration.parameters?.required).toEqual(["url"]);
		expect(declaration.parameters?.properties?.method?.enum).toEqual([
			"GET",
			"POST",
			"PUT",
			"DELETE",
			"PATCH",
			"HEAD",
			"OPTIONS",
		]);
		expect(declaration.parameters?.properties?.method?.default).toBe("GET");
		expect(declaration.parameters?.properties?.timeout?.default).toBe(10000);
		expect(declaration.parameters?.type).toBe(Type.OBJECT);
	});

	it("performs GET and returns status/body/headers", async () => {
		const tool = new HttpRequestTool();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				status: 200,
				headers: new Headers({ "content-type": "text/plain" }),
				text: async () => "ok",
			}),
		);
		const result = await tool.runAsync(
			{ url: "https://example.com" },
			makeContext(),
		);
		expect(result.statusCode).toBe(200);
		expect(result.body).toBe("ok");
		expect(result.headers["content-type"]).toBe("text/plain");
		expect(result.error).toBeUndefined();
		vi.unstubAllGlobals();
	});

	it("appends query params to the URL", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "",
		});
		vi.stubGlobal("fetch", fetchMock);
		await tool.runAsync(
			{
				url: "https://example.com/search",
				params: { q: "adk", page: "1" },
			},
			makeContext(),
		);
		const calledUrl = String(fetchMock.mock.calls[0][0]);
		expect(calledUrl).toContain("q=adk");
		expect(calledUrl).toContain("page=1");
		vi.unstubAllGlobals();
	});

	it("forwards method, headers, and body", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 201,
			headers: new Headers(),
			text: async () => '{"id":1}',
		});
		vi.stubGlobal("fetch", fetchMock);
		const result = await tool.runAsync(
			{
				url: "https://example.com/items",
				method: "POST",
				headers: { "content-type": "application/json" },
				body: '{"name":"x"}',
			},
			makeContext(),
		);
		expect(result.statusCode).toBe(201);
		expect(result.body).toBe('{"id":1}');
		expect(fetchMock.mock.calls[0][1]).toMatchObject({
			method: "POST",
			body: '{"name":"x"}',
		});
		vi.unstubAllGlobals();
	});

	it("returns error envelope when fetch rejects", async () => {
		const tool = new HttpRequestTool();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValue(new Error("network down")),
		);
		const result = await tool.runAsync(
			{ url: "https://example.com" },
			makeContext(),
		);
		expect(result.error).toContain("network down");
		expect(result.statusCode).toBe(0);
		vi.unstubAllGlobals();
	});

	it("stringifies non-Error fetch rejections", async () => {
		const tool = new HttpRequestTool();
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue("boom"));
		const result = await tool.runAsync(
			{ url: "https://example.com" },
			makeContext(),
		);
		expect(result.error).toContain("boom");
		vi.unstubAllGlobals();
	});
});

describe("GoogleSearch heavy matrix leftover edges", () => {
	it("exposes google_search metadata and required query", () => {
		const tool = new GoogleSearch();
		const declaration = tool.getDeclaration();
		expect(tool.name).toBe("google_search");
		expect(tool.isLongRunning).toBe(false);
		expect(declaration.parameters?.required).toEqual(["query"]);
		expect(declaration.parameters?.properties?.num_results?.default).toBe(5);
	});

	it("returns two mock results embedding the query", async () => {
		const tool = new GoogleSearch();
		const result = await tool.runAsync({ query: "adk" }, makeContext());
		expect(result.results).toHaveLength(2);
		expect(result.results[0].title).toContain("adk");
		expect(result.results[0].link).toBe("https://example.com/1");
		expect(result.results[1].link).toBe("https://example.com/2");
	});

	it("ignores num_results and always returns two mocks", async () => {
		const tool = new GoogleSearch();
		for (const num_results of [0, 1, 10, 100]) {
			const result = await tool.runAsync(
				{ query: "x", num_results },
				makeContext(),
			);
			expect(result.results).toHaveLength(2);
		}
	});

	it("embeds empty query into titles and snippets", async () => {
		const tool = new GoogleSearch();
		const result = await tool.runAsync({ query: "" }, makeContext());
		expect(result.results[0].title).toBe("Result 1 for ");
		expect(result.results[0].snippet).toContain('""');
	});

	it("does not mutate tool context actions", async () => {
		const tool = new GoogleSearch();
		const context = { actions: { escalate: true } } as ToolContext;
		await tool.runAsync({ query: "x" }, context);
		expect(context.actions).toEqual({ escalate: true });
	});
});
