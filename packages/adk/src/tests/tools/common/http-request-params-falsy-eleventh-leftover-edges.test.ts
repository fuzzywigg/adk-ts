import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequestTool } from "../../../tools/common/http-request-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

/**
 * Eleventh leftover: `if (params)` is truthiness. Falsy params skip
 * searchParams; empty objects append nothing; empty keys/values still append.
 */
describe("HttpRequestTool params falsy eleventh leftover", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	function mockOkFetch() {
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;
		return fetchMock;
	}

	it.each([
		{ label: "undefined omitted", params: Symbol.for("omit") },
		{ label: "null", params: null },
		{ label: "false", params: false },
		{ label: "0", params: 0 },
		{ label: "empty string", params: "" },
	])("does not append query string when params is $label", async ({
		params,
	}) => {
		const fetchMock = mockOkFetch();
		const args: Record<string, any> = { url: "https://example.com/q" };
		if (params !== Symbol.for("omit")) {
			args.params = params;
		}
		await new HttpRequestTool().runAsync(args, makeContext());
		expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/q");
	});

	it("empty object params is truthy but appends no search pairs", async () => {
		const fetchMock = mockOkFetch();
		await new HttpRequestTool().runAsync(
			{ url: "https://example.com/q", params: {} },
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/q");
	});

	it("empty-string value is still appended", async () => {
		const fetchMock = mockOkFetch();
		await new HttpRequestTool().runAsync(
			{ url: "https://example.com/q", params: { q: "" } },
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/q?q=");
	});

	it("empty-string key is still appended", async () => {
		const fetchMock = mockOkFetch();
		await new HttpRequestTool().runAsync(
			{ url: "https://example.com/q", params: { "": "x" } },
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][0]).toBe("https://example.com/q?=x");
	});
});
