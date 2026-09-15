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
} = vi.hoisted(() => {
	const transportClose = vi.fn();
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

const { McpClientService } = await import("../../../tools/mcp/client");

/**
 * Twenty-first leftover (HEAVY tip-relaunch residual after fourteenth `"0"`
 * forward and twentieth stdio race): SSE `...(timeout ? { timeout } : {})` —
 * `"true"` / `[]` / `true` / `NEGATIVE_INFINITY` forwarded; SameValueZero
 * `-0` omitted.
 */
describe("mcp client sse timeout true/negzero twenty-first leftover", () => {
	beforeEach(() => {
		connect.mockReset();
		callTool.mockReset();
		close.mockReset();
		setRequestHandler.mockReset();
		removeRequestHandler.mockReset();
		transportClose.mockReset();
		StdioClientTransport.mockClear();
		StreamableHTTPClientTransport.mockClear();
		connect.mockResolvedValue(undefined);
		close.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: '"true"', timeout: "true" },
		{ label: "empty array", timeout: [] as never[] },
		{ label: "boolean true", timeout: true },
		{ label: "NEGATIVE_INFINITY", timeout: Number.NEGATIVE_INFINITY },
	])("timeout $label is truthy and forwarded on SSE requestInit", async ({
		timeout,
	}) => {
		const service = new McpClientService({
			name: "sse-true",
			timeout: timeout as any,
			transport: {
				mode: "sse",
				serverUrl: "https://example.test/mcp",
			},
		});
		await service.initialize();
		expect(StreamableHTTPClientTransport.mock.calls[0][1].requestInit).toEqual(
			expect.objectContaining({ timeout }),
		);
		await service.close();
	});

	it("timeout -0 is falsy and omitted from SSE requestInit", async () => {
		const service = new McpClientService({
			name: "sse-neg0",
			timeout: -0 as any,
			transport: {
				mode: "sse",
				serverUrl: "https://example.test/mcp",
			},
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit,
		).not.toHaveProperty("timeout");
		await service.close();
	});
});
