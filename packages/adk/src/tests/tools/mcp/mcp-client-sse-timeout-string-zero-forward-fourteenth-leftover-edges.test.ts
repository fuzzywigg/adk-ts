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
 * Fourteenth leftover: requestInit spreads timeout only when
 * `this.config.timeout` is truthy. timeout: "0" is truthy string and is
 * forwarded; numeric 0 is omitted (seventh leftover covered falsy skip).
 */
describe("mcp client sse timeout string-zero forward fourteenth leftover", () => {
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

	it('timeout: "0" is truthy and forwarded on SSE requestInit', async () => {
		const service = new McpClientService({
			name: "sse-zero",
			description: "string zero timeout",
			timeout: "0" as any,
			transport: {
				mode: "sse",
				serverUrl: "https://example.test/mcp",
			},
		});
		await service.initialize();
		expect(StreamableHTTPClientTransport.mock.calls[0][1].requestInit).toEqual(
			expect.objectContaining({ timeout: "0" }),
		);
		await service.close();
	});

	it("timeout: 0 still omitted from requestInit (control)", async () => {
		const service = new McpClientService({
			name: "sse-num-zero",
			description: "numeric zero timeout",
			timeout: 0,
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
