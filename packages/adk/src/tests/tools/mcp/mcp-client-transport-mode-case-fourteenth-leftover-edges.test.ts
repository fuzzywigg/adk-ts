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
 * Fourteenth leftover: createTransport uses strict `mode === "sse"` —
 * "SSE"/"Sse" fall through to STDIO branch.
 */
describe("mcp client transport mode case fourteenth leftover", () => {
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
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		"SSE",
		"Sse",
		"sSe",
	] as const)('mode %j is not "sse" so STDIO transport is used', async (mode) => {
		const service = new McpClientService({
			name: "mode-case",
			transport: {
				mode: mode as any,
				command: "node",
				args: ["server.js"],
			},
		});
		await service.initialize();
		expect(StdioClientTransport).toHaveBeenCalledTimes(1);
		expect(StreamableHTTPClientTransport).not.toHaveBeenCalled();
	});

	it('lowercase mode "sse" still uses StreamableHTTP (control)', async () => {
		const service = new McpClientService({
			name: "mode-sse",
			transport: {
				mode: "sse",
				serverUrl: "http://127.0.0.1:9",
			},
		});
		await service.initialize();
		expect(StreamableHTTPClientTransport).toHaveBeenCalledTimes(1);
		expect(StdioClientTransport).not.toHaveBeenCalled();
	});
});
