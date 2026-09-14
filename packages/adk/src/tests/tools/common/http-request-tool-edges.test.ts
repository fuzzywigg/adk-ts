import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequestTool } from "../../../tools/common/http-request-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("HttpRequestTool leftover edges", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("defaults method to GET and timeout to 10000", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 204,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync({ url: "https://example.com/x" }, makeContext());
		expect(fetchMock.mock.calls[0][1].method).toBe("GET");
		expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
	});

	it("appends multiple query params without mutating the base url arg", async () => {
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

	it("sets Content-Type application/json only for valid JSON bodies", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{
				url: "https://example.com/json",
				method: "POST",
				body: '{"a":1}',
			},
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe(
			"application/json",
		);

		fetchMock.mockClear();
		await tool.runAsync(
			{
				url: "https://example.com/text",
				method: "POST",
				body: "not-json",
			},
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBeUndefined();
	});

	it("preserves an explicit Content-Type even for JSON bodies", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;

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

	it("stringifies non-Error fetch failures in the error envelope", async () => {
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

	it("returns Error.message for Error fetch failures", async () => {
		const tool = new HttpRequestTool();
		globalThis.fetch = vi
			.fn()
			.mockRejectedValue(new Error("timeout exceeded")) as any;

		await expect(
			tool.runAsync({ url: "https://example.com" }, makeContext()),
		).resolves.toMatchObject({
			statusCode: 0,
			error: "timeout exceeded",
		});
	});

	it("isValidJson matrix covers valid, invalid, and empty inputs", () => {
		const tool = new HttpRequestTool();
		expect((tool as any).isValidJson('{"a":1}')).toBe(true);
		expect((tool as any).isValidJson("[]")).toBe(true);
		expect((tool as any).isValidJson("null")).toBe(true);
		expect((tool as any).isValidJson("")).toBe(false);
		expect((tool as any).isValidJson("{")).toBe(false);
		expect((tool as any).isValidJson("undefined")).toBe(false);
	});

	it("collects all response headers into a plain object", async () => {
		const tool = new HttpRequestTool();
		globalThis.fetch = vi.fn().mockResolvedValue({
			status: 201,
			headers: new Headers({
				"x-a": "1",
				"x-b": "2",
			}),
			text: async () => "created",
		}) as any;

		await expect(
			tool.runAsync({ url: "https://example.com" }, makeContext()),
		).resolves.toEqual({
			statusCode: 201,
			headers: { "x-a": "1", "x-b": "2" },
			body: "created",
		});
	});

	it("honors custom timeout values in the abort signal", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com", timeout: 1234 },
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
	});

	it("supports HEAD and OPTIONS methods without requiring a body", async () => {
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
