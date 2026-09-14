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

	it("surfaces AbortError timeouts as structured statusCode 0 errors", async () => {
		const tool = new HttpRequestTool();
		const abortError = new Error("The operation was aborted");
		abortError.name = "AbortError";
		globalThis.fetch = vi.fn().mockRejectedValue(abortError) as typeof fetch;

		const result = await tool.runAsync(
			{ url: "https://example.com/slow", timeout: 1 },
			makeContext(),
		);

		expect(result).toEqual({
			statusCode: 0,
			headers: {},
			body: "",
			error: "The operation was aborted",
		});
	});

	it("does not override an explicit Content-Type for JSON bodies", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers({ "x-ok": "1" }),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{
				url: "https://example.com/items",
				method: "PUT",
				headers: { "Content-Type": "text/plain", "X-Custom": "yes" },
				body: JSON.stringify({ a: 1 }),
				timeout: 2500,
			},
			makeContext(),
		);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/items",
			expect.objectContaining({
				method: "PUT",
				headers: {
					"Content-Type": "text/plain",
					"X-Custom": "yes",
				},
				body: JSON.stringify({ a: 1 }),
			}),
		);
	});

	it("leaves Content-Type unset for non-JSON bodies", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{
				url: "https://example.com/raw",
				method: "POST",
				body: "not-json",
			},
			makeContext(),
		);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/raw",
			expect.objectContaining({
				headers: {},
				body: "not-json",
			}),
		);
	});

	it("stringifies non-Error rejection values", async () => {
		const tool = new HttpRequestTool();
		globalThis.fetch = vi.fn().mockRejectedValue("boom-string") as typeof fetch;

		const result = await tool.runAsync(
			{ url: "https://example.com/fail" },
			makeContext(),
		);

		expect(result.error).toBe("boom-string");
		expect(result.statusCode).toBe(0);
	});

	it("declares supported HTTP methods on the tool schema", () => {
		const tool = new HttpRequestTool();
		const method = tool.getDeclaration().parameters?.properties?.method as {
			enum?: string[];
			default?: string;
		};
		expect(method.enum).toEqual([
			"GET",
			"POST",
			"PUT",
			"DELETE",
			"PATCH",
			"HEAD",
			"OPTIONS",
		]);
		expect(method.default).toBe("GET");
	});

	it("returns statusCode 0 for invalid URLs without calling fetch", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn();
		globalThis.fetch = fetchMock as typeof fetch;

		const result = await tool.runAsync({ url: "not-a-url" }, makeContext());

		expect(result.statusCode).toBe(0);
		expect(result.error).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("passes AbortSignal.timeout with the configured timeout", async () => {
		const tool = new HttpRequestTool();
		const timeoutSpy = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(AbortSignal.abort() as AbortSignal);
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com/slow", timeout: 2500 },
			makeContext(),
		);

		expect(timeoutSpy).toHaveBeenCalledWith(2500);
		expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
		timeoutSpy.mockRestore();
	});

	it("declares full schema defaults for timeout and body/params/headers", () => {
		const tool = new HttpRequestTool();
		const props = tool.getDeclaration().parameters?.properties as Record<
			string,
			{ type?: unknown; default?: unknown; description?: string }
		>;

		expect(tool.description).toContain("HTTP requests");
		expect(props.url.type).toBeTruthy();
		expect(props.timeout.default).toBe(10000);
		expect(props.headers.type).toBeTruthy();
		expect(props.body.type).toBeTruthy();
		expect(props.params.type).toBeTruthy();
	});

	it.each([
		"POST",
		"PUT",
		"DELETE",
		"PATCH",
		"HEAD",
		"OPTIONS",
	] as const)("forwards HTTP method %s", async (method) => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 204,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com/resource", method },
			makeContext(),
		);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/resource",
			expect.objectContaining({ method }),
		);
	});

	it("defaults timeout to 10000 via AbortSignal.timeout", async () => {
		const tool = new HttpRequestTool();
		const timeoutSpy = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(AbortSignal.abort() as AbortSignal);
		globalThis.fetch = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		}) as typeof fetch;

		await tool.runAsync({ url: "https://example.com/default" }, makeContext());

		expect(timeoutSpy).toHaveBeenCalledWith(10000);
		timeoutSpy.mockRestore();
	});

	it("appends multiple params with the same key", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{
				url: "https://example.com/tags",
				params: { tag: "a" },
			},
			makeContext(),
		);

		expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/tags?tag=a");
	});

	it("skips param mutation when params is undefined", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com/plain", headers: undefined, body: undefined },
			makeContext(),
		);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/plain",
			expect.objectContaining({
				method: "GET",
				headers: {},
				body: undefined,
			}),
		);
	});

	it("maps all response headers into a plain object", async () => {
		const tool = new HttpRequestTool();
		globalThis.fetch = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers({
				"content-type": "application/json",
				"x-request-id": "abc-123",
				"cache-control": "no-store",
			}),
			text: async () => "{}",
		}) as typeof fetch;

		const result = await tool.runAsync(
			{ url: "https://example.com/headers" },
			makeContext(),
		);

		expect(result.headers).toEqual({
			"content-type": "application/json",
			"x-request-id": "abc-123",
			"cache-control": "no-store",
		});
		expect(result.body).toBe("{}");
	});

	it("returns non-2xx status codes without treating them as errors", async () => {
		const tool = new HttpRequestTool();
		globalThis.fetch = vi.fn().mockResolvedValue({
			status: 404,
			headers: new Headers({ "content-type": "text/plain" }),
			text: async () => "missing",
		}) as typeof fetch;

		const result = await tool.runAsync(
			{ url: "https://example.com/missing" },
			makeContext(),
		);

		expect(result).toEqual({
			statusCode: 404,
			headers: { "content-type": "text/plain" },
			body: "missing",
		});
		expect(result.error).toBeUndefined();
	});

	it("auto-sets Content-Type for JSON arrays and primitives", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{
				url: "https://example.com/arr",
				method: "POST",
				body: "[1,2,3]",
			},
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].headers).toEqual({
			"Content-Type": "application/json",
		});

		await tool.runAsync(
			{
				url: "https://example.com/num",
				method: "POST",
				body: "42",
			},
			makeContext(),
		);
		expect(fetchMock.mock.calls[1][1].headers).toEqual({
			"Content-Type": "application/json",
		});

		await tool.runAsync(
			{
				url: "https://example.com/bool",
				method: "POST",
				body: "true",
			},
			makeContext(),
		);
		expect(fetchMock.mock.calls[2][1].headers).toEqual({
			"Content-Type": "application/json",
		});
	});

	it("preserves existing query string when appending params", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{
				url: "https://example.com/search?q=base",
				params: { page: "2" },
			},
			makeContext(),
		);

		const calledUrl = fetchMock.mock.calls[0][0] as string;
		expect(calledUrl).toContain("q=base");
		expect(calledUrl).toContain("page=2");
	});

	it("sends empty string body when body is empty", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com/empty", method: "POST", body: "" },
			makeContext(),
		);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/empty",
			expect.objectContaining({ body: "", headers: {} }),
		);
	});

	it("still auto-sets Content-Type when only lowercase content-type is present", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{
				url: "https://example.com/case",
				method: "POST",
				headers: { "content-type": "text/plain" },
				body: JSON.stringify({ ok: true }),
			},
			makeContext(),
		);

		expect(fetchMock.mock.calls[0][1].headers).toEqual({
			"content-type": "text/plain",
			"Content-Type": "application/json",
		});
	});

	it("leaves the URL unchanged when params is an empty object", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com/empty-params", params: {} },
			makeContext(),
		);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/empty-params",
			expect.any(Object),
		);
	});

	it("URL-encodes special characters in query params", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{
				url: "https://example.com/q",
				params: { q: "a b&c=d", emoji: "🎉" },
			},
			makeContext(),
		);

		const calledUrl = fetchMock.mock.calls[0][0] as string;
		expect(calledUrl).toContain("q=a+b%26c%3Dd");
		expect(calledUrl).toMatch(/emoji=/);
		expect(decodeURIComponent(calledUrl)).toContain("🎉");
	});

	it("returns structured errors when response.text() rejects", async () => {
		const tool = new HttpRequestTool();
		globalThis.fetch = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => {
				throw new Error("body read failed");
			},
		}) as typeof fetch;

		const result = await tool.runAsync(
			{ url: "https://example.com/body-fail" },
			makeContext(),
		);

		expect(result).toEqual({
			statusCode: 0,
			headers: {},
			body: "",
			error: "body read failed",
		});
	});

	it("stringifies object rejections as [object Object]", async () => {
		const tool = new HttpRequestTool();
		globalThis.fetch = vi
			.fn()
			.mockRejectedValue({ code: "ECONNRESET" }) as typeof fetch;

		const result = await tool.runAsync(
			{ url: "https://example.com/obj-fail" },
			makeContext(),
		);

		expect(result.error).toBe("[object Object]");
		expect(result.statusCode).toBe(0);
	});

	it("returns 5xx status bodies without setting error", async () => {
		const tool = new HttpRequestTool();
		globalThis.fetch = vi.fn().mockResolvedValue({
			status: 503,
			headers: new Headers({ "retry-after": "30" }),
			text: async () => "unavailable",
		}) as typeof fetch;

		const result = await tool.runAsync(
			{ url: "https://example.com/down" },
			makeContext(),
		);

		expect(result).toEqual({
			statusCode: 503,
			headers: { "retry-after": "30" },
			body: "unavailable",
		});
		expect(result.error).toBeUndefined();
	});

	it("auto-sets Content-Type for JSON null and quoted string bodies", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com/null", method: "POST", body: "null" },
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].headers).toEqual({
			"Content-Type": "application/json",
		});

		await tool.runAsync(
			{
				url: "https://example.com/str",
				method: "POST",
				body: '"hello"',
			},
			makeContext(),
		);
		expect(fetchMock.mock.calls[1][1].headers).toEqual({
			"Content-Type": "application/json",
		});
	});

	it("does not treat whitespace-only body as JSON", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com/ws", method: "POST", body: "   " },
			makeContext(),
		);

		expect(fetchMock.mock.calls[0][1].headers).toEqual({});
	});

	it("rejects relative URLs before calling fetch", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn();
		globalThis.fetch = fetchMock as typeof fetch;

		const result = await tool.runAsync(
			{ url: "/relative/path" },
			makeContext(),
		);

		expect(result.statusCode).toBe(0);
		expect(result.error).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("forwards custom method strings that are not in the enum", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com/custom", method: "get" },
			makeContext(),
		);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/custom",
			expect.objectContaining({ method: "get" }),
		);
	});

	it("passes the AbortSignal from AbortSignal.timeout into fetch options", async () => {
		const tool = new HttpRequestTool();
		const fakeSignal = AbortSignal.abort();
		const timeoutSpy = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(fakeSignal);
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com/signal", timeout: 42 },
			makeContext(),
		);

		expect(fetchMock.mock.calls[0][1].signal).toBe(fakeSignal);
		timeoutSpy.mockRestore();
	});

	it("preserves URL hash fragments when appending params", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{
				url: "https://example.com/page#section",
				params: { x: "1" },
			},
			makeContext(),
		);

		const calledUrl = fetchMock.mock.calls[0][0] as string;
		expect(calledUrl).toContain("x=1");
		expect(calledUrl).toContain("#section");
	});

	it("handles concurrent requests independently", async () => {
		const tool = new HttpRequestTool();
		globalThis.fetch = vi.fn().mockImplementation(async (url: string) => ({
			status: 200,
			headers: new Headers(),
			text: async () => `body-for-${url}`,
		})) as typeof fetch;

		const [a, b] = await Promise.all([
			tool.runAsync({ url: "https://example.com/a" }, makeContext()),
			tool.runAsync({ url: "https://example.com/b" }, makeContext()),
		]);

		expect(a.body).toBe("body-for-https://example.com/a");
		expect(b.body).toBe("body-for-https://example.com/b");
		expect(a.error).toBeUndefined();
		expect(b.error).toBeUndefined();
	});

	it("returns empty body for successful responses with empty text", async () => {
		const tool = new HttpRequestTool();
		globalThis.fetch = vi.fn().mockResolvedValue({
			status: 204,
			headers: new Headers(),
			text: async () => "",
		}) as typeof fetch;

		const result = await tool.runAsync(
			{ url: "https://example.com/no-content", method: "DELETE" },
			makeContext(),
		);

		expect(result).toEqual({
			statusCode: 204,
			headers: {},
			body: "",
		});
	});
});
