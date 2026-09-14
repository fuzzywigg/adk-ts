import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequestTool } from "../../../tools/common/http-request-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("HttpRequestTool Content-Type key-case seventh leftover (post #158)", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it.each([
		{ label: "CONTENT-TYPE", key: "CONTENT-TYPE" },
		{ label: "Content-type", key: "Content-type" },
		{ label: "content-Type", key: "content-Type" },
		{ label: "CONTENT-type", key: "CONTENT-type" },
	] as const)("still auto-adds Content-Type when only $label is present (exact-key check)", async ({
		key,
	}) => {
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
				headers: { [key]: "text/plain" },
				body: JSON.stringify({ ok: true }),
			},
			makeContext(),
		);

		expect(fetchMock.mock.calls[0][1].headers).toEqual({
			[key]: "text/plain",
			"Content-Type": "application/json",
		});
	});

	it("does not auto-add when exact Content-Type key is already set", async () => {
		const tool = new HttpRequestTool();
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{
				url: "https://example.com/exact",
				method: "POST",
				headers: { "Content-Type": "application/xml" },
				body: JSON.stringify({ ok: true }),
			},
			makeContext(),
		);

		expect(fetchMock.mock.calls[0][1].headers).toEqual({
			"Content-Type": "application/xml",
		});
	});
});
