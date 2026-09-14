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
 * Fifteenth leftover: headers use `|| {}` so false/0/"" collapse to {}.
 * null/undefined already covered in leftover client tests.
 */
describe("mcp client headers falsy non-nullish fifteenth leftover", () => {
	beforeEach(() => {
		connect.mockReset();
		callTool.mockReset();
		close.mockReset();
		setRequestHandler.mockReset();
		removeRequestHandler.mockReset();
		transportClose.mockReset();
		StreamableHTTPClientTransport.mockClear();
		StreamableHTTPClientTransport.mockImplementation(
			function StreamableHTTPClientTransport() {
				return { close: transportClose };
			},
		);
		connect.mockResolvedValue(undefined);
		close.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		false,
		0,
		"",
	] as const)("transport.headers %j coalesces to {}", async (headers) => {
		const service = new McpClientService({
			name: "sse-headers-falsy",
			description: "headers || {}",
			transport: {
				mode: "sse" as const,
				serverUrl: "https://mcp.example.com/sse",
				headers: headers as any,
			},
		});
		await service.initialize();
		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit.headers).toEqual({});
	});

	it("real headers object still forwarded (control)", async () => {
		const service = new McpClientService({
			name: "sse-headers-ok",
			description: "headers keep",
			transport: {
				mode: "sse" as const,
				serverUrl: "https://mcp.example.com/sse",
				headers: { Authorization: "Bearer t" },
			},
		});
		await service.initialize();
		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit.headers).toEqual({ Authorization: "Bearer t" });
	});
});
