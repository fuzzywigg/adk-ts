import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequestTool } from "../../../tools/common/http-request-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("HttpRequestTool method/timeout/headers nullish seventh leftover (post #158)", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it.each([
		{ label: '""', method: "" },
		{ label: "null", method: null },
	] as const)("keeps explicit falsy method ($label) instead of defaulting to GET", async ({
		method,
	}) => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 204,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com/m", method: method as any },
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].method).toBe(method);
	});

	it("passes timeout:null through to AbortSignal.timeout (no default)", async () => {
		const tool = new HttpRequestTool();
		const timeoutSpy = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(AbortSignal.abort() as any);
		globalThis.fetch = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		}) as any;

		await tool.runAsync(
			{ url: "https://example.com/t", timeout: null as any },
			makeContext(),
		);
		expect(timeoutSpy).toHaveBeenCalledWith(null);
		timeoutSpy.mockRestore();
	});

	it("spreads headers:null into {} so request still succeeds", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com/h", headers: null as any },
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].headers).toEqual({});
	});

	it.each([
		"0",
		"false",
		"null",
	] as const)("JSON body %j is truthy so auto Content-Type still applies", async (body) => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com/json-literal", method: "POST", body },
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].headers).toEqual({
			"Content-Type": "application/json",
		});
		expect(fetchMock.mock.calls[0][1].body).toBe(body);
	});
});
