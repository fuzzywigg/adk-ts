import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequestTool } from "../../../tools/common/http-request-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("HttpRequestTool", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("exposes http_request metadata", () => {
		const tool = new HttpRequestTool();
		const declaration = tool.getDeclaration();

		expect(tool.name).toBe("http_request");
		expect(declaration.parameters?.required).toEqual(["url"]);
	});

	it("performs a successful GET request", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers({ "content-type": "text/plain" }),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const result = await tool.runAsync(
			{ url: "https://example.com/api" },
			makeContext(),
		);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/api",
			expect.objectContaining({ method: "GET" }),
		);
		expect(result).toEqual({
			statusCode: 200,
			headers: { "content-type": "text/plain" },
			body: "ok",
		});
	});

	it("appends query params to the request URL", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{
				url: "https://example.com/search",
				params: { q: "adk", page: "1" },
			},
			makeContext(),
		);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/search?q=adk&page=1",
			expect.any(Object),
		);
	});

	it("sets JSON Content-Type when body is valid JSON", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 201,
			headers: new Headers(),
			text: async () => '{"id":1}',
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{
				url: "https://example.com/items",
				method: "POST",
				body: JSON.stringify({ name: "item" }),
			},
			makeContext(),
		);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/items",
			expect.objectContaining({
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "item" }),
			}),
		);
	});

	it("returns a structured error when fetch fails", async () => {
		const tool = new HttpRequestTool();
		globalThis.fetch = vi
			.fn()
			.mockRejectedValue(new Error("network down")) as typeof fetch;

		const result = await tool.runAsync(
			{ url: "https://example.com/fail" },
			makeContext(),
		);

		expect(result).toEqual({
			statusCode: 0,
			headers: {},
			body: "",
			error: "network down",
		});
	});
});
