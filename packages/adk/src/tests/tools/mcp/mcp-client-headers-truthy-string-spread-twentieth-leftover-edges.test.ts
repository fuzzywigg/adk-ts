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
 * Twentieth leftover: SSE `...(transport.headers || {})` —
 * truthy strings "false"/"0" do not coalesce; spread yields char-index keys.
 */
describe("mcp client headers truthy string spread twentieth leftover", () => {
	beforeEach(() => {
		connect.mockReset();
		close.mockReset();
		setRequestHandler.mockReset();
		removeRequestHandler.mockReset();
		transportClose.mockReset();
		StreamableHTTPClientTransport.mockClear();
		connect.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('headers: "false" spreads to char-index keys', async () => {
		const service = new McpClientService({
			name: "hdr-false-str",
			transport: {
				mode: "sse",
				serverUrl: "http://127.0.0.1:9",
				headers: "false" as any,
			},
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({ 0: "f", 1: "a", 2: "l", 3: "s", 4: "e" });
	});

	it('headers: "0" spreads to {0:"0"}', async () => {
		const service = new McpClientService({
			name: "hdr-zero-str",
			transport: {
				mode: "sse",
				serverUrl: "http://127.0.0.1:9",
				headers: "0" as any,
			},
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({ 0: "0" });
	});

	it("headers: false still → {} (fourteenth control)", async () => {
		const service = new McpClientService({
			name: "hdr-false-bool",
			transport: {
				mode: "sse",
				serverUrl: "http://127.0.0.1:9",
				headers: false as any,
			},
			headers: { "X-Cfg": "1" },
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({ "X-Cfg": "1" });
	});

	it("array headers still numeric keys (fourteenth control)", async () => {
		const service = new McpClientService({
			name: "hdr-array",
			transport: {
				mode: "sse",
				serverUrl: "http://127.0.0.1:9",
				headers: ["Authorization"] as any,
			},
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({ 0: "Authorization" });
	});
});
