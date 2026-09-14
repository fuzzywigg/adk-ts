import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequestTool } from "../../../tools/common/http-request-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("HttpRequestTool abort-signal orchestration leftovers", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it.each([
		0, 1, 250, 10_000, 60_000,
	])("wires AbortSignal.timeout(%s) into fetch options", async (timeout) => {
		const tool = new HttpRequestTool();
		const fakeSignal = AbortSignal.abort("test-timeout");
		const timeoutSpy = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(fakeSignal);
		const fetchMock = vi.fn().mockResolvedValue({
			status: 204,
			headers: new Headers(),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com/t", timeout },
			makeContext(),
		);

		expect(timeoutSpy).toHaveBeenCalledWith(timeout);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://example.com/t",
			expect.objectContaining({ signal: fakeSignal }),
		);
	});

	it("surfaces an already-aborted AbortSignal rejection as statusCode 0", async () => {
		const tool = new HttpRequestTool();
		const signal = AbortSignal.abort("pre-aborted");
		vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
		globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
			if (init?.signal?.aborted) {
				const err = new Error("The operation was aborted");
				err.name = "AbortError";
				throw err;
			}
			return {
				status: 200,
				headers: new Headers(),
				text: async () => "ok",
			};
		}) as typeof fetch;

		const result = await tool.runAsync(
			{ url: "https://example.com/aborted", timeout: 5 },
			makeContext(),
		);

		expect(result).toEqual({
			statusCode: 0,
			headers: {},
			body: "",
			error: "The operation was aborted",
		});
		expect(signal.aborted).toBe(true);
	});

	it.each([
		{
			label: "AbortError",
			factory: () => {
				const err = new Error("aborted by timeout");
				err.name = "AbortError";
				return err;
			},
			expected: "aborted by timeout",
		},
		{
			label: "TimeoutError",
			factory: () => {
				const err = new Error("TimeoutError: signal timed out");
				err.name = "TimeoutError";
				return err;
			},
			expected: "TimeoutError: signal timed out",
		},
		{
			label: "DOMException AbortError",
			factory: () => {
				try {
					return new DOMException("The operation was aborted", "AbortError");
				} catch {
					const err = new Error("The operation was aborted");
					err.name = "AbortError";
					return err;
				}
			},
			expected: "The operation was aborted",
		},
		{
			label: "non-Error abort string",
			factory: () => "aborted",
			expected: "aborted",
		},
		{
			label: "non-Error abort object",
			factory: () => ({ reason: "cancel" }),
			expected: "[object Object]",
		},
	])("maps $label abort/rejection onto structured error envelope", async ({
		factory,
		expected,
	}) => {
		const tool = new HttpRequestTool();
		globalThis.fetch = vi.fn().mockRejectedValue(factory()) as typeof fetch;

		const result = await tool.runAsync(
			{ url: "https://example.com/fail-abort", timeout: 10 },
			makeContext(),
		);

		expect(result).toEqual({
			statusCode: 0,
			headers: {},
			body: "",
			error: expected,
		});
	});

	it("uses default AbortSignal.timeout(10000) when timeout is omitted", async () => {
		const tool = new HttpRequestTool();
		const timeoutSpy = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(AbortSignal.abort());
		globalThis.fetch = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		}) as typeof fetch;

		await tool.runAsync({ url: "https://example.com/default" }, makeContext());
		expect(timeoutSpy).toHaveBeenCalledWith(10000);
	});

	it("treats explicit timeout undefined like the default via destructuring default", async () => {
		const tool = new HttpRequestTool();
		const timeoutSpy = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(AbortSignal.abort());
		globalThis.fetch = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers(),
			text: async () => "ok",
		}) as typeof fetch;

		await tool.runAsync(
			{ url: "https://example.com/undef", timeout: undefined },
			makeContext(),
		);
		expect(timeoutSpy).toHaveBeenCalledWith(10000);
	});

	it("still attaches an abort signal for HEAD requests with timeout 0", async () => {
		const tool = new HttpRequestTool();
		const fakeSignal = AbortSignal.abort("zero");
		const timeoutSpy = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(fakeSignal);
		const fetchMock = vi.fn().mockResolvedValue({
			status: 200,
			headers: new Headers({ "x-head": "1" }),
			text: async () => "",
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const result = await tool.runAsync(
			{ url: "https://example.com/head", method: "HEAD", timeout: 0 },
			makeContext(),
		);

		expect(timeoutSpy).toHaveBeenCalledWith(0);
		expect(fetchMock.mock.calls[0][1].signal).toBe(fakeSignal);
		expect(result.statusCode).toBe(200);
	});

	it("propagates abort errors without leaking partial response headers/body", async () => {
		const tool = new HttpRequestTool();
		globalThis.fetch = vi.fn().mockImplementation(async () => {
			const err = new Error("network abort mid-flight");
			err.name = "AbortError";
			throw err;
		}) as typeof fetch;

		const result = await tool.runAsync(
			{
				url: "https://example.com/partial",
				headers: { Authorization: "secret" },
				body: '{"x":1}',
				timeout: 15,
			},
			makeContext(),
		);

		expect(result).toEqual({
			statusCode: 0,
			headers: {},
			body: "",
			error: "network abort mid-flight",
		});
	});
});
