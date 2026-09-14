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

beforeEach(() => {
	connect.mockReset();
	callTool.mockReset();
	close.mockReset();
	setRequestHandler.mockReset();
	removeRequestHandler.mockReset();
	transportClose.mockReset();
	StdioClientTransport.mockClear();
	StreamableHTTPClientTransport.mockClear();
	StdioClientTransport.mockImplementation(function StdioClientTransport() {
		return { close: transportClose };
	});
	StreamableHTTPClientTransport.mockImplementation(
		function StreamableHTTPClientTransport() {
			return { close: transportClose };
		},
	);
	connect.mockResolvedValue(undefined);
	callTool.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
	close.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.clearAllMocks();
});

describe("MCP client sixth leftover: SSE timeout omit (post #151)", () => {
	it("omits timeout key from requestInit when config.timeout is absent", async () => {
		const service = new McpClientService({
			name: "sse-no-timeout",
			description: "timeout omit",
			transport: {
				mode: "sse" as const,
				serverUrl: "https://mcp.example.com/sse",
				headers: { Authorization: "Bearer t" },
			},
		});
		await service.initialize();

		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit).toEqual({
			headers: { Authorization: "Bearer t" },
		});
		expect(opts.requestInit).not.toHaveProperty("timeout");
	});

	it("omits timeout when config.timeout is explicitly undefined", async () => {
		const service = new McpClientService({
			name: "sse-undef-timeout",
			description: "timeout undefined",
			timeout: undefined,
			transport: {
				mode: "sse" as const,
				serverUrl: "https://mcp.example.com/sse",
			},
		});
		await service.initialize();

		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit,
		).not.toHaveProperty("timeout");
	});

	it.each([
		0,
		Number.NaN,
		"" as unknown as number,
	])("omits timeout for falsy timeout value %p via ternary", async (timeout) => {
		const service = new McpClientService({
			name: `sse-falsy-${String(timeout)}`,
			description: "falsy timeout",
			timeout: timeout as any,
			transport: {
				mode: "sse" as const,
				serverUrl: "https://mcp.example.com/sse",
			},
		});
		await service.initialize();

		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit,
		).not.toHaveProperty("timeout");
	});

	it("includes timeout when config.timeout is a positive number", async () => {
		const service = new McpClientService({
			name: "sse-with-timeout",
			description: "timeout present contrast",
			timeout: 1500,
			transport: {
				mode: "sse" as const,
				serverUrl: "https://mcp.example.com/sse",
				headers: {},
			},
		});
		await service.initialize();

		expect(StreamableHTTPClientTransport.mock.calls[0][1].requestInit).toEqual({
			headers: {},
			timeout: 1500,
		});
	});
});
