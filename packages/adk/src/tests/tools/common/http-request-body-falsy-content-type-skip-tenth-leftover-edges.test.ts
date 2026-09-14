import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequestTool } from "../../../tools/common/http-request-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

/**
 * Tenth leftover: if (body && !Content-Type && isValidJson(body)) — falsy body
 * skips Content-Type injection. Fifth leftover matrices truthy bodies / key case.
 */
describe("http-request body-falsy content-type-skip tenth leftover edges", () => {
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
		{ label: "empty string", body: "" },
		{ label: "null", body: null },
		{ label: "undefined omitted", body: Symbol.for("omit") },
		{ label: "0", body: 0 },
		{ label: "false", body: false },
	])("skips Content-Type injection when body is falsy ($label)", async ({
		body,
	}) => {
		const tool = new HttpRequestTool();
		const fetchMock = mockOkFetch();
		const params: Record<string, any> = {
			url: "https://example.com/falsy-body",
			method: "POST",
		};
		if (body !== Symbol.for("omit")) {
			params.body = body;
		}
		await tool.runAsync(params, makeContext());
		const headers = fetchMock.mock.calls[0][1].headers as Record<
			string,
			string
		>;
		expect(headers["Content-Type"]).toBeUndefined();
	});

	it("injects application/json for truthy valid JSON body without Content-Type", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = mockOkFetch();
		await tool.runAsync(
			{
				url: "https://example.com/json",
				method: "POST",
				body: "{}",
			},
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe(
			"application/json",
		);
	});

	it("does not inject Content-Type for truthy non-JSON body", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = mockOkFetch();
		await tool.runAsync(
			{
				url: "https://example.com/plain",
				method: "POST",
				body: "not-json",
			},
			makeContext(),
		);
		expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBeUndefined();
	});
});
