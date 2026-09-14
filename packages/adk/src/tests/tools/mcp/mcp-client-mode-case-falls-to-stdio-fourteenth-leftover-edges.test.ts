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
 * Fourteenth leftover: createTransport uses `mode === "sse"` (case-sensitive).
 * "SSE" / "http" / missing mode fall through to StdioClientTransport.
 */
describe("mcp client mode case falls to stdio fourteenth leftover", () => {
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
		callTool.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
		close.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		"SSE",
		"Sse",
		"http",
		"HTTP",
		"stdio",
	] as const)('mode %j is not === "sse" so StdioClientTransport is used', async (mode) => {
		const service = new McpClientService({
			name: "mode-case",
			description: "mode case leftover",
			transport: {
				mode: mode as any,
				command: "node",
				args: ["server.js"],
				serverUrl: "https://example.test/mcp",
			} as any,
		});
		await service.initialize();
		expect(StdioClientTransport).toHaveBeenCalled();
		expect(StreamableHTTPClientTransport).not.toHaveBeenCalled();
		await service.close();
	});

	it('exact mode "sse" still uses StreamableHTTP (control)', async () => {
		const service = new McpClientService({
			name: "mode-sse",
			description: "sse control",
			transport: {
				mode: "sse",
				serverUrl: "https://example.test/mcp",
			},
		});
		await service.initialize();
		expect(StreamableHTTPClientTransport).toHaveBeenCalled();
		expect(StdioClientTransport).not.toHaveBeenCalled();
		await service.close();
	});
});
