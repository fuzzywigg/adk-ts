import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequestTool } from "../../../tools/common/http-request-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("HttpRequestTool fifth leftover — null defaults / falsy params / Content-Type / JSON edges", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	function mockOkFetch(body = "ok") {
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers({ "x-test": "1" }),
			text: async () => body,
		});
		globalThis.fetch = fetchMock as typeof fetch;
		return fetchMock;
	}

	it("method/headers/timeout null do not take destructuring defaults", async () => {
		const tool = new HttpRequestTool();
		const timeoutSpy = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(AbortSignal.abort() as any);
		const fetchMock = mockOkFetch();

		const result = await tool.runAsync(
			{
				url: "https://example.com/null-defaults",
				method: null as any,
				headers: null as any,
				timeout: null as any,
			},
			makeContext(),
		);

		expect(timeoutSpy).toHaveBeenCalledWith(null);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/null-defaults",
			expect.objectContaining({
				method: null,
				headers: {},
			}),
		);
		expect(result.statusCode).toBe(200);
		timeoutSpy.mockRestore();
	});

	const falsyParams: Array<{ label: string; params: any }> = [
		{ label: "null", params: null },
		{ label: "false", params: false },
		{ label: "0", params: 0 },
		{ label: "empty string", params: "" },
	];

	for (const { label, params } of falsyParams) {
		it(`skips params append when params is falsy (${label})`, async () => {
			const tool = new HttpRequestTool();
			const fetchMock = mockOkFetch();
			await tool.runAsync(
				{ url: "https://example.com/p", params },
				makeContext(),
			);
			expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/p");
		});
	}

	it("CONTENT-TYPE exact key check is case-sensitive; uppercase does not block default", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = mockOkFetch();
		await tool.runAsync(
			{
				url: "https://example.com/ct",
				method: "POST",
				body: '{"a":1}',
				headers: { "CONTENT-TYPE": "text/plain" },
			},
			makeContext(),
		);
		const headers = fetchMock.mock.calls[0][1].headers as Record<
			string,
			string
		>;
		expect(headers["CONTENT-TYPE"]).toBe("text/plain");
		expect(headers["Content-Type"]).toBe("application/json");
	});

	it("mixed-case Content-Type other than exact key still gets application/json", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = mockOkFetch();
		await tool.runAsync(
			{
				url: "https://example.com/ct2",
				method: "POST",
				body: '{"b":2}',
				headers: { "content-type": "text/plain" },
			},
			makeContext(),
		);
		const headers = fetchMock.mock.calls[0][1].headers as Record<
			string,
			string
		>;
		expect(headers["content-type"]).toBe("text/plain");
		expect(headers["Content-Type"]).toBe("application/json");
	});

	it("exact Content-Type present prevents injecting application/json", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = mockOkFetch();
		await tool.runAsync(
			{
				url: "https://example.com/ct3",
				method: "POST",
				body: '{"c":3}',
				headers: { "Content-Type": "application/xml" },
			},
			makeContext(),
		);
		const headers = fetchMock.mock.calls[0][1].headers as Record<
			string,
			string
		>;
		expect(headers["Content-Type"]).toBe("application/xml");
		expect(
			Object.keys(headers).filter((k) => k === "Content-Type"),
		).toHaveLength(1);
	});

	const jsonBodies: Array<{
		label: string;
		body: string;
		expectJsonHeader: boolean;
	}> = [
		{ label: "whitespace only", body: "   ", expectJsonHeader: false },
		{ label: "undefined literal", body: "undefined", expectJsonHeader: false },
		{
			label: "double-encoded string",
			body: '"{\\"a\\":1}"',
			expectJsonHeader: true,
		},
		{ label: "json array", body: "[1,2]", expectJsonHeader: true },
		{ label: "json null", body: "null", expectJsonHeader: true },
		{ label: "json false", body: "false", expectJsonHeader: true },
		{ label: "json number", body: "42", expectJsonHeader: true },
		{ label: "trailing junk", body: '{"a":1}x', expectJsonHeader: false },
		{ label: "empty object", body: "{}", expectJsonHeader: true },
	];

	for (const { label, body, expectJsonHeader } of jsonBodies) {
		it(`isValidJson / Content-Type injection: ${label}`, async () => {
			const tool = new HttpRequestTool();
			const fetchMock = mockOkFetch();
			await tool.runAsync(
				{ url: "https://example.com/json", method: "POST", body },
				makeContext(),
			);
			const headers = fetchMock.mock.calls[0][1].headers as Record<
				string,
				string
			>;
			if (expectJsonHeader) {
				expect(headers["Content-Type"]).toBe("application/json");
			} else {
				expect(headers["Content-Type"]).toBeUndefined();
			}
		});
	}

	it("params object with empty values still appends search params", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = mockOkFetch();
		await tool.runAsync(
			{
				url: "https://example.com/q",
				params: { a: "", b: "1" },
			},
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/q?a=&b=1");
	});

	it("AbortSignal.timeout(0) is forwarded for explicit zero timeout", async () => {
		const tool = new HttpRequestTool();
		const timeoutSpy = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(AbortSignal.abort() as any);
		mockOkFetch();
		await tool.runAsync(
			{ url: "https://example.com/t0", timeout: 0 },
			makeContext(),
		);
		expect(timeoutSpy).toHaveBeenCalledWith(0);
		timeoutSpy.mockRestore();
	});
});
