import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	connect,
	callTool,
	close,
	setRequestHandler,
	removeRequestHandler,
	transportClose,
	StdioClientTransport,
	StreamableHTTPClientTransport,
	withRetryMock,
} = vi.hoisted(() => {
	const transportClose = vi.fn();
	const withRetryMock = vi.fn(
		(
			fn: (this: unknown, ...args: unknown[]) => unknown,
			instance: unknown,
			_reinit: unknown,
			_maxRetries?: unknown,
		) => {
			return async (...args: unknown[]) => fn.apply(instance, args);
		},
	);
	return {
		connect: vi.fn(),
		callTool: vi.fn(),
		close: vi.fn(),
		setRequestHandler: vi.fn(),
		removeRequestHandler: vi.fn(),
		transportClose,
		StdioClientTransport: vi.fn(function StdioClientTransport() {
			return { close: transportClose };
		}),
		StreamableHTTPClientTransport: vi.fn(
			function StreamableHTTPClientTransport() {
				return { close: transportClose };
			},
		),
		withRetryMock,
	};
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
	Client: vi.fn(function Client() {
		return {
			connect,
			callTool,
			close,
			setRequestHandler,
			removeRequestHandler,
		};
	}),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
	StdioClientTransport,
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
	StreamableHTTPClientTransport,
}));

vi.mock("../../../tools/mcp/utils", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../../tools/mcp/utils")>();
	return {
		...actual,
		withRetry: withRetryMock,
	};
});

const { McpClientService } = await import("../../../tools/mcp/client");

/**
 * Twentieth leftover residual deepen (complements #259 true/negzero):
 * `retryOptions?.maxRetries || 2` — POSITIVE_INFINITY / `1` / `{}` /
 * `Object(true)` forwarded; `NaN` collapses to 2.
 */
describe("mcp client maxRetries posinf/nan/object-true twentieth residual deepen", () => {
	beforeEach(() => {
		connect.mockReset();
		callTool.mockReset();
		close.mockReset();
		setRequestHandler.mockReset();
		removeRequestHandler.mockReset();
		transportClose.mockReset();
		withRetryMock.mockClear();
		connect.mockResolvedValue(undefined);
		callTool.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
		close.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	function stdio(retryOptions?: unknown) {
		return new McpClientService({
			name: "maxretries-residual-deepen",
			transport: {
				mode: "stdio" as const,
				command: "node",
				args: ["server.js"],
			},
			...(retryOptions !== undefined ? { retryOptions } : {}),
		} as any);
	}

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("maxRetries $label forwarded to withRetry via || 2", async ({ value }) => {
		const service = stdio({ maxRetries: value });
		await service.initialize();
		await service.callTool("t", {});
		expect(withRetryMock).toHaveBeenCalled();
		const maxRetriesArg = withRetryMock.mock.calls[0][3];
		expect(maxRetriesArg).toBe(value);
	});

	it("maxRetries NaN collapses to 2 via ||", async () => {
		const service = stdio({ maxRetries: Number.NaN });
		await service.initialize();
		await service.callTool("t", {});
		expect(withRetryMock.mock.calls[0][3]).toBe(2);
	});
});
